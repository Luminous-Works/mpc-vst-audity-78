// Audity '78 DSP core. Header-only C++17, standard library only.
//
// Used by src/Audity78.cpp (the MPC VST2 wrapper) and by tools/host_test.cpp. It includes
// no plugin SDK header. The WebAudio emulator in src/audio/AudityEngine.ts is the
// reference for the sound; wavetables, parameter ranges and the factory patches come from
// generated_data.hpp (tools/export_data.mjs).
//
// Signal path per voice:
//   VCO1 + VCO2 (128-sample wavetables, morph, cross-mod FM, optional hard sync) + sub
//   + noise + ring mod -> HPF (12 dB TPT SVF) -> LPF (24 dB cascade, tanh drive)
//   -> TG2 amp envelope * velocity -> voice sum -> chorus -> delay -> reverb -> soft clip.
//
// Real-time rules (MPC SDK): prepare() allocates; nothing else allocates, locks or does I/O.
// CPU rules: no libm transcendental per sample. Pitch and filter coefficients are computed
// once per control chunk (kCtl samples); sine and tanh use cheap approximations.
//
// KNOWN GAPS vs the reference (also listed in README.md):
//   * Wavetable lookup is linear-interpolated and not band-limited: bright tables alias on high notes.
//   * vco2Sync is true hard sync; the reference approximates it with a pitch shift.
//   * The mod matrix and step sequencer of the patch model are not implemented.
//   * SSM2040 is a 4-pole cascade with tanh drive, not a circuit model.
//   * Voice count defaults to 8 (AUDITY_MAX_VOICES); the reference has 16. Raise it only after a device CPU bench.
#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

#include "generated_data.hpp"

#ifndef AUDITY_MAX_VOICES
#define AUDITY_MAX_VOICES 8
#endif

namespace audity {

constexpr float kPi = 3.14159265358979f;
constexpr int kMaxVoices = AUDITY_MAX_VOICES;
constexpr int kCtl = 16;  // control-rate chunk, samples

// Indices into Settings::p, same order as kParams (ParamKey order in src/types/synth.ts).
enum P : int {
  glide, masterTune, masterVolume, unisonDetune,
  vco1Morph, vco1Tune, vco1Fine, vco1Level, vco1Pwm,
  vco2Morph, vco2Tune, vco2Fine, vco2Level, crossModFm,
  noiseLevel, noiseColor, ringModLevel,
  hpfCutoff, hpfResonance,
  lpfCutoff, lpfResonance, lpfDrive, lpfEnvAmount, lpfKeyTrack,
  tg1Attack, tg1Decay, tg1Sustain, tg1Release,
  tg2Attack, tg2Decay, tg2Sustain, tg2Release, vcaVelocitySens,
  lfoRate, lfoDelay, lfoToPitch, lfoToFilter, lfoToMorph,
  chorusMix, chorusRate, delayMix, delayTime, delayFeedback, reverbMix, reverbDecay,
  kParamCount
};
static_assert(kParamCount == kNumContinuous, "P enum must match generated kParams");

enum VoiceMode : int { Poly = 0, Unison = 1, Mono = 2 };
enum LfoShape : int { Sine = 0, Triangle, Saw, Square, SampleHold };

// A complete patch in plain units (what the plugin parameters hold).
struct Settings {
  float p[kNumContinuous];
  int voiceMode = Poly, vco1Wave = 0, vco1Oct = 0, vco2Wave = 1, vco2Oct = 0, vco2Sync = 0, lfoShape = Triangle;

  static Settings defaults() {
    Settings s;
    for (int i = 0; i < kNumContinuous; ++i) s.p[i] = kParams[i].def;
    return s;
  }
  static Settings fromProgram(const Program& pr) {
    Settings s;
    for (int i = 0; i < kNumContinuous; ++i) s.p[i] = pr.v[i];
    s.voiceMode = pr.d.voiceMode; s.vco1Wave = pr.d.vco1Wave; s.vco1Oct = pr.d.vco1Oct;
    s.vco2Wave = pr.d.vco2Wave; s.vco2Oct = pr.d.vco2Oct; s.vco2Sync = pr.d.vco2Sync; s.lfoShape = pr.d.lfoShape;
    return s;
  }
};

namespace detail {

inline float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }
inline int clampi(int x, int lo, int hi) { return x < lo ? lo : (x > hi ? hi : x); }
inline float semiToRatio(float st) { return std::exp2(st * (1.0f / 12.0f)); }
inline float noteToHz(float note) { return 440.0f * semiToRatio(note - 69.0f); }
inline float coefFor(float seconds, float sr) { return 1.0f - std::exp(-3.0f / std::max(1.0f, seconds * sr)); }
inline float wrap01(float x) { x -= (float)(int)x; return x < 0.0f ? x + 1.0f : x; }

// Parabolic sine, phase in [0,1). Max error about 0.001.
inline float fastSin(float phase) {
  float x = wrap01(phase) * 2.0f - 1.0f;
  float y = -4.0f * x * (1.0f - (x < 0 ? -x : x));
  float ay = y < 0 ? -y : y;
  return 0.775f * y + 0.225f * y * ay;
}
// Rational tanh approximation, exact at 0, saturates to +-1 beyond |x|=3.
inline float fastTanh(float x) {
  x = clampf(x, -3.0f, 3.0f);
  return x * (27.0f + x * x) / (27.0f + 9.0f * x * x);
}

// Single-cycle lookup with morph between frame a and frame b; phase in [0,1).
inline float waveAt(const WaveDef& w, float phase, float morph) {
  float pos = phase * kWaveLen;
  int i0 = (int)pos;
  float fr = pos - (float)i0;
  i0 &= (kWaveLen - 1);
  int i1 = (i0 + 1) & (kWaveLen - 1);
  float a = w.a[i0] + fr * (w.a[i1] - w.a[i0]);
  float b = w.b[i0] + fr * (w.b[i1] - w.b[i0]);
  return a + morph * (b - a);
}

struct Adsr {
  enum Stage { Idle, Attack, Decay, Sustain, Release };
  Stage stage = Idle;
  float level = 0.0f;
  void gate(bool on) { if (on) stage = Attack; else if (stage != Idle) stage = Release; }
  bool active() const { return stage != Idle; }
  float next(float ca, float cd, float sus, float cr) {
    switch (stage) {
      case Attack:  level += ca * (1.25f - level); if (level >= 1.0f) { level = 1.0f; stage = Decay; } break;
      case Decay:   level += cd * (sus - level); if (level - sus < 0.0005f) { level = sus; stage = Sustain; } break;
      case Sustain: level = sus; break;
      case Release: level -= cr * level; if (level < 0.0002f) { level = 0.0f; stage = Idle; } break;
      case Idle:    level = 0.0f; break;
    }
    return level;
  }
};

struct Lcg {  // deterministic noise, no global state
  uint32_t s = 22222u;
  float next() { s = s * 1664525u + 1013904223u; return (float)(int32_t)s * (1.0f / 2147483648.0f); }
};

struct Voice {
  int note = -1;
  float vel = 0.0f, curNote = 60.0f, targetNote = 60.0f, detuneCents = 0.0f, pan = 0.0f;
  float ph1 = 0.0f, ph2 = 0.0f, phSub = 0.0f;
  float lp[4] = {0, 0, 0, 0}, hpIc1 = 0.0f, hpIc2 = 0.0f, noiseLp = 0.0f;
  float age = 0.0f;
  uint32_t order = 0;
  bool held = false;
  Adsr tg1, tg2;
  bool active() const { return tg2.active(); }
};

struct DelayLine {
  std::vector<float> buf;
  int pos = 0;
  void init(int n) { buf.assign((size_t)std::max(2, n), 0.0f); pos = 0; }
  void clear() { std::fill(buf.begin(), buf.end(), 0.0f); pos = 0; }
  float readFrac(float delaySamples) const {
    const int n = (int)buf.size();
    float rp = (float)pos - delaySamples;
    while (rp < 0) rp += (float)n;
    int i0 = (int)rp; float fr = rp - (float)i0;
    int i1 = i0 + 1; if (i1 >= n) i1 -= n; if (i0 >= n) i0 -= n;
    return buf[(size_t)i0] + fr * (buf[(size_t)i1] - buf[(size_t)i0]);
  }
  void write(float x) { buf[(size_t)pos] = x; if (++pos >= (int)buf.size()) pos = 0; }
};

struct Comb {
  std::vector<float> b; int i = 0; float lp = 0.0f;
  void init(int n) { b.assign((size_t)std::max(1, n), 0.0f); i = 0; lp = 0.0f; }
  void clear() { std::fill(b.begin(), b.end(), 0.0f); i = 0; lp = 0.0f; }
  float run(float x, float fb, float damp) {
    float y = b[(size_t)i];
    lp = y * (1.0f - damp) + lp * damp;
    b[(size_t)i] = x + lp * fb;
    if (++i >= (int)b.size()) i = 0;
    return y;
  }
};
struct Allpass {
  std::vector<float> b; int i = 0;
  void init(int n) { b.assign((size_t)std::max(1, n), 0.0f); i = 0; }
  void clear() { std::fill(b.begin(), b.end(), 0.0f); i = 0; }
  float run(float x) {
    float y = b[(size_t)i];
    float o = y - x;
    b[(size_t)i] = x + y * 0.5f;
    if (++i >= (int)b.size()) i = 0;
    return o;
  }
};

}  // namespace detail

class Synth {
 public:
  // Allocates. Call from the host's prepare(), never from the audio callback.
  void prepare(double sampleRate) {
    sr_ = (float)sampleRate;
    chorusL_.init((int)(0.05f * sr_)); chorusR_.init((int)(0.05f * sr_));
    delayL_.init((int)(1.2f * sr_)); delayR_.init((int)(1.2f * sr_));
    static const int combLen[4] = {1116, 1188, 1277, 1356};
    static const int apLen[2] = {556, 441};
    const float k = sr_ / 44100.0f;
    for (int i = 0; i < 4; ++i) { combL_[i].init((int)(combLen[i] * k)); combR_[i].init((int)((combLen[i] + 23) * k)); }
    for (int i = 0; i < 2; ++i) { apL_[i].init((int)(apLen[i] * k)); apR_[i].init((int)((apLen[i] + 23) * k)); }
    s_ = Settings::defaults();
    reset();
  }

  void reset() {
    for (auto& v : voices_) v = detail::Voice();
    heldCount_ = 0; counter_ = 0; lfoPhase_ = 0.0f; chorusPhase_ = 0.0f; shValue_ = 0.0f;
    gain_ = s_.p[masterVolume]; bend_ = 0.0f; wheel_ = 0.0f;
    chorusL_.clear(); chorusR_.clear(); delayL_.clear(); delayR_.clear();
    for (auto& c : combL_) c.clear();
    for (auto& c : combR_) c.clear();
    for (auto& a : apL_) a.clear();
    for (auto& a : apR_) a.clear();
  }

  void setSettings(const Settings& s) { s_ = s; }  // cheap, safe every block
  void pitchBend(float semitones) { bend_ = semitones; }
  void modWheel(float v01) { wheel_ = v01; }

  void noteOn(int note, float velocity01) {
    if (s_.voiceMode == Mono) {
      if (heldCount_ < kMaxVoices) held_[heldCount_++] = note;
      detail::Voice& v = voices_[0];
      const bool legato = v.held && v.active();
      v.note = note; v.vel = velocity01; v.targetNote = (float)note; v.held = true; v.order = ++counter_;
      if (!legato) { v.curNote = (float)note; v.age = 0.0f; v.tg1.gate(true); v.tg2.gate(true); v.detuneCents = 0; v.pan = 0; }
      return;
    }
    const int count = (s_.voiceMode == Unison) ? 3 : 1;
    for (int u = 0; u < count; ++u) {
      detail::Voice& v = allocVoice();
      v = detail::Voice();
      v.note = note; v.vel = velocity01; v.curNote = v.targetNote = (float)note; v.held = true; v.order = ++counter_;
      v.detuneCents = (count == 1) ? 0.0f : (u - 1) * s_.p[unisonDetune] * 18.0f;
      v.pan = (count == 1) ? 0.0f : (u - 1) * 0.45f;
      v.tg1.gate(true); v.tg2.gate(true);
    }
  }

  void noteOff(int note) {
    if (s_.voiceMode == Mono) {
      for (int i = 0; i < heldCount_; ++i) if (held_[i] == note) { held_[i] = held_[--heldCount_]; --i; }
      detail::Voice& v = voices_[0];
      if (heldCount_ > 0) { v.targetNote = (float)held_[heldCount_ - 1]; v.note = held_[heldCount_ - 1]; }  // last-note priority
      else { v.held = false; v.tg1.gate(false); v.tg2.gate(false); }
      return;
    }
    for (auto& v : voices_) if (v.held && v.note == note) { v.held = false; v.tg1.gate(false); v.tg2.gate(false); }
  }

  void allNotesOff() {
    heldCount_ = 0;
    for (auto& v : voices_) if (v.held) { v.held = false; v.tg1.gate(false); v.tg2.gate(false); }
  }

  // Renders n frames, overwriting outL/outR. Allocation free.
  void process(float* outL, float* outR, int n) {
    using namespace detail;
    const float* p = s_.p;
    const WaveDef& w1 = kWaves[clampi(s_.vco1Wave, 0, kNumWaves - 1)];
    const WaveDef& w2 = kWaves[clampi(s_.vco2Wave, 0, kNumWaves - 1)];
    const float ca1 = coefFor(p[tg1Attack], sr_), cd1 = coefFor(p[tg1Decay], sr_), cr1 = coefFor(p[tg1Release], sr_);
    const float ca2 = coefFor(p[tg2Attack], sr_), cd2 = coefFor(p[tg2Decay], sr_), cr2 = coefFor(p[tg2Release], sr_);
    const float glideCoef = p[glide] < 0.002f ? 1.0f : coefFor(p[glide], sr_);
    const float lfoInc = p[lfoRate] / sr_;
    const float tuneSemi = p[masterTune] / 100.0f + bend_;
    const float resK = p[lpfResonance] * 3.7f;
    const float driveG = 1.0f + p[lpfDrive] * 4.0f;
    const float driveComp = 1.0f / (1.0f + 0.25f * (driveG - 1.0f));
    const float resComp = 1.0f + resK * 0.25f;
    const float noiseDamp = clampf(1.0f - p[noiseColor], 0.0f, 1.0f) * 0.95f;
    const float vibDepth = p[lfoToPitch] + wheel_ * 0.5f;
    const float m1base = p[vco1Morph], m2base = p[vco2Morph];
    const float subGain = p[vco1Pwm] > 0.65f ? 0.14f : 0.05f;
    // HPF coefficients (cutoff is not modulated, so once per call)
    const float hg = std::tan(kPi * clampf(p[hpfCutoff], 20.0f, 0.4f * sr_) / sr_);
    const float hk = 2.0f - 1.85f * p[hpfResonance];
    const float ha1 = 1.0f / (1.0f + hg * (hg + hk)), ha2 = hg * ha1, ha3 = hg * ha2;
    const float fxCh = p[chorusMix], fxDl = p[delayMix], fxRv = p[reverbMix];
    const float dtS = clampf(p[delayTime], 0.05f, 1.0f) * sr_;
    const float revFb = 0.6f + 0.35f * p[reverbDecay];

    for (int base = 0; base < n; base += kCtl) {
      const int m = std::min(kCtl, n - base);
      float* oL = outL + base; float* oR = outR + base;
      for (int i = 0; i < m; ++i) { oL[i] = 0.0f; oR[i] = 0.0f; }

      // LFO value held for the chunk
      float lfo;
      switch (s_.lfoShape) {
        case Sine:     lfo = fastSin(lfoPhase_); break;
        case Triangle: lfo = 4.0f * std::fabs(lfoPhase_ - 0.5f) - 1.0f; break;
        case Saw:      lfo = 2.0f * lfoPhase_ - 1.0f; break;
        case Square:   lfo = lfoPhase_ < 0.5f ? 1.0f : -1.0f; break;
        default:       lfo = shValue_; break;
      }
      lfoPhase_ += lfoInc * (float)m;
      if (lfoPhase_ >= 1.0f) { lfoPhase_ -= 1.0f; shValue_ = rng_.next(); }

      for (auto& v : voices_) {
        if (!v.active()) continue;
        v.curNote += std::min(1.0f, glideCoef * (float)m) * (v.targetNote - v.curNote);
        v.age += (float)m / sr_;
        const float fade = p[lfoDelay] > 0.001f ? clampf(v.age / p[lfoDelay], 0.0f, 1.0f) : 1.0f;
        const float lf = lfo * fade;
        const float basePitch = v.curNote + tuneSemi + v.detuneCents / 100.0f + lf * vibDepth;
        const float inc1 = noteToHz(basePitch + p[vco1Tune] + 12.0f * s_.vco1Oct + p[vco1Fine] / 100.0f) / sr_;
        const float inc2 = noteToHz(basePitch + p[vco2Tune] + 12.0f * s_.vco2Oct + p[vco2Fine] / 100.0f) / sr_;
        const float m1 = clampf(m1base + lf * p[lfoToMorph] * 0.5f, 0.0f, 1.0f);
        const float m2 = clampf(m2base + lf * p[lfoToMorph] * 0.5f, 0.0f, 1.0f);
        const float kt = semiToRatio((v.curNote - 60.0f) * p[lpfKeyTrack]);
        const float e1c = v.tg1.level;  // filter envelope sampled at chunk start
        float fc = p[lpfCutoff] * kt + p[lpfEnvAmount] * 8800.0f * e1c * (0.45f + 0.55f * v.vel) + lf * p[lfoToFilter] * 1600.0f;
        fc = clampf(fc, 20.0f, std::min(16000.0f, 0.2f * sr_));
        const float gg = 2.0f * kPi * fc / sr_;
        const float G = gg / (1.0f + gg);
        const float velAmp = (1.0f - p[vcaVelocitySens]) + p[vcaVelocitySens] * v.vel;
        const float panL = 1.0f - std::max(0.0f, v.pan), panR = 1.0f + std::min(0.0f, v.pan);

        for (int i = 0; i < m; ++i) {
          const float x1 = waveAt(w1, v.ph1, m1);
          const float x2 = waveAt(w2, wrap01(v.ph2 + p[crossModFm] * x1 * 0.25f), m2);
          const float sub = fastSin(v.phSub) * subGain;
          v.ph1 += inc1; v.phSub += 0.5f * inc1; v.ph2 += inc2;
          if (v.phSub >= 1.0f) v.phSub -= 1.0f;
          if (v.ph1 >= 1.0f) { v.ph1 -= 1.0f; if (s_.vco2Sync) v.ph2 = 0.0f; }
          if (v.ph2 >= 1.0f) v.ph2 -= 1.0f;

          v.noiseLp = rng_.next() * (1.0f - noiseDamp) + v.noiseLp * noiseDamp;
          float osc = x1 * p[vco1Level] + x2 * p[vco2Level] + sub + v.noiseLp * p[noiseLevel] * 0.6f + x1 * x2 * p[ringModLevel] * 0.8f;

          v.tg1.next(ca1, cd1, p[tg1Sustain], cr1);
          const float e2 = v.tg2.next(ca2, cd2, p[tg2Sustain], cr2);

          {  // HPF (TPT SVF, high-pass output)
            const float v3 = osc - v.hpIc2;
            const float s1 = ha1 * v.hpIc1 + ha2 * v3;
            const float s2 = v.hpIc2 + ha2 * v.hpIc1 + ha3 * v3;
            v.hpIc1 = 2.0f * s1 - v.hpIc1; v.hpIc2 = 2.0f * s2 - v.hpIc2;
            osc = osc - hk * s1 - s2;
          }
          {  // LPF: 4-pole cascade, resonance feedback, tanh drive
            const float in = fastTanh((osc - resK * v.lp[3]) * driveG);
            v.lp[0] += G * (in - v.lp[0]);
            v.lp[1] += G * (v.lp[0] - v.lp[1]);
            v.lp[2] += G * (v.lp[1] - v.lp[2]);
            v.lp[3] += G * (v.lp[2] - v.lp[3]);
            osc = v.lp[3] * resComp * driveComp;
          }
          const float out = osc * e2 * velAmp * 0.28f;
          oL[i] += out * panL;
          oR[i] += out * panR;
        }
      }

      // Stereo FX: chorus -> delay -> reverb -> master
      for (int i = 0; i < m; ++i) {
        float l = oL[i], r = oR[i];
        chorusL_.write(l); chorusR_.write(r);
        const float lfoA = fastSin(chorusPhase_), lfoB = fastSin(chorusPhase_ + 0.25f);
        chorusPhase_ += p[chorusRate] / sr_; if (chorusPhase_ >= 1.0f) chorusPhase_ -= 1.0f;
        l += chorusL_.readFrac((0.012f + 0.004f * lfoA) * sr_) * fxCh;
        r += chorusR_.readFrac((0.012f + 0.004f * lfoB) * sr_) * fxCh;

        const float dl = delayL_.readFrac(dtS), dr = delayR_.readFrac(dtS * 1.07f);
        delayL_.write(l + dl * p[delayFeedback]); delayR_.write(r + dr * p[delayFeedback]);
        l += dl * fxDl; r += dr * fxDl;

        const float rin = (l + r) * 0.1f;
        float rl = 0, rr = 0;
        for (int c = 0; c < 4; ++c) { rl += combL_[c].run(rin, revFb, 0.3f); rr += combR_[c].run(rin, revFb, 0.3f); }
        for (int a = 0; a < 2; ++a) { rl = apL_[a].run(rl); rr = apR_[a].run(rr); }
        l += rl * fxRv; r += rr * fxRv;

        gain_ += 0.002f * (p[masterVolume] - gain_);
        oL[i] = fastTanh(l * gain_ * 1.4f);
        oR[i] = fastTanh(r * gain_ * 1.4f);
      }
    }
  }

 private:
  detail::Voice& allocVoice() {
    detail::Voice* oldest = &voices_[0];
    for (auto& v : voices_) {
      if (!v.active()) return v;
      if (v.order < oldest->order) oldest = &v;
    }
    return *oldest;  // steal the oldest
  }

  Settings s_ = Settings::defaults();
  float sr_ = 44100.0f;
  detail::Voice voices_[kMaxVoices];
  int held_[kMaxVoices] = {};
  int heldCount_ = 0;
  uint32_t counter_ = 0;
  float lfoPhase_ = 0.0f, shValue_ = 0.0f, chorusPhase_ = 0.0f, gain_ = 0.78f, bend_ = 0.0f, wheel_ = 0.0f;
  detail::Lcg rng_;
  detail::DelayLine chorusL_, chorusR_, delayL_, delayR_;
  detail::Comb combL_[4], combR_[4];
  detail::Allpass apL_[2], apR_[2];
};

}  // namespace audity
