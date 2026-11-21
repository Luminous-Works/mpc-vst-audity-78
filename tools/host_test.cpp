// Native check of the DSP core, no plugin SDK needed:
//   g++ -std=c++17 -O2 -I src/lumina tools/host_test.cpp -o build/host_test && build/host_test
// Renders every factory program (a held chord then release) and fails on NaN/inf,
// silence, or clipping beyond 1.0. Also reports render speed (x realtime) as a rough CPU guide.
#include <chrono>
#include <cstdio>
#include <cstring>
#include "audity_core.hpp"

int main() {
  const double sr = 44100.0; const int block = 128, blocks = 44100 * 3 / 128;
  // parameter table and enum must agree
  static const char* names[] = {"glide","masterTune","masterVolume","unisonDetune","vco1Morph","vco1Tune","vco1Fine","vco1Level","vco1Pwm","vco2Morph","vco2Tune","vco2Fine","vco2Level","crossModFm","noiseLevel","noiseColor","ringModLevel","hpfCutoff","hpfResonance","lpfCutoff","lpfResonance","lpfDrive","lpfEnvAmount","lpfKeyTrack","tg1Attack","tg1Decay","tg1Sustain","tg1Release","tg2Attack","tg2Decay","tg2Sustain","tg2Release","vcaVelocitySens","lfoRate","lfoDelay","lfoToPitch","lfoToFilter","lfoToMorph","chorusMix","chorusRate","delayMix","delayTime","delayFeedback","reverbMix","reverbDecay"};
  int bad = 0;
  for (int i = 0; i < audity::kNumContinuous; ++i) if (std::strcmp(names[i], audity::kParams[i].id)) { std::printf("FAIL param %d: enum %s vs data %s\n", i, names[i], audity::kParams[i].id); ++bad; }
  audity::Synth s; s.prepare(sr);
  static float L[128], R[128];
  double totalSec = 0.0; int fails = bad;
  for (int pi = 0; pi < audity::kNumPrograms; ++pi) {
    s.reset(); s.setSettings(audity::Settings::fromProgram(audity::kPrograms[pi]));
    s.noteOn(48, 0.8f); s.noteOn(55, 0.8f); s.noteOn(60, 0.8f); s.noteOn(64, 0.8f);
    float peak = 0, tailPeak = 0; bool nan = false;
    auto t0 = std::chrono::steady_clock::now();
    for (int b = 0; b < blocks; ++b) {
      if (b == blocks * 2 / 3) { s.allNotesOff(); }
      s.process(L, R, block);
      for (int i = 0; i < block; ++i) {
        float a = std::fmax(std::fabs(L[i]), std::fabs(R[i]));
        if (!std::isfinite(L[i]) || !std::isfinite(R[i])) nan = true;
        peak = std::fmax(peak, a);
        if (b == blocks - 1) tailPeak = std::fmax(tailPeak, a);
      }
    }
    totalSec += std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    bool ok = !nan && peak > 0.01f && peak <= 1.0001f;
    std::printf("%-2d %-26s peak %.3f tail %.4f %s\n", pi + 1, audity::kPrograms[pi].name, peak, tailPeak, ok ? "ok" : (nan ? "FAIL nan" : peak <= 0.01f ? "FAIL silent" : "FAIL clip"));
    if (!ok) ++fails;
  }
  double audioSec = 3.0 * audity::kNumPrograms;
  std::printf("voices=%d  render speed %.0fx realtime (host CPU, 4-note chord)\n", audity::kMaxVoices, audioSec / totalSec);
  std::printf(fails ? "FAILED (%d)\n" : "PASSED\n", fails);
  return fails ? 1 : 0;
}
