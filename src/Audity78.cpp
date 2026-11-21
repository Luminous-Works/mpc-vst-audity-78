// Audity 78 - an MPC instrument plugin by Lumina Aerospace LLC
//
// MPC VST2 wrapper around the shared DSP core in src/lumina/audity_core.hpp.
// The core holds all the sound; this file only declares parameters, maps them to the
// core's Settings, routes MIDI and ships the factory programs.
//
// Signal flow: see the header of audity_core.hpp.
//
// Parameter identity is permanent (SDK AGENTS.md): ids are the ParamKey names of the
// reference emulator, the order below must never change, new parameters go at the END.
// Parameter 0 (Volume) is nudged by the host on every load, which is harmless for a master volume.
//
// Reference values that are 0..1 "percent" are exposed as 0..100 % here and divided by 100
// when handed to the core.

#include "mpc_plugin.h"

#include <cstring>
#include <string>

#include "lumina/audity_core.hpp"

namespace {

using namespace audity;

// How a native parameter maps to the core.
enum Kind { Cont, VoiceModeK, Wave1K, Oct1K, Wave2K, Oct2K, SyncK, LfoShapeK };

struct Native { const char* key; const char* name; Kind kind; };

// Native parameter order. Append only.
const Native kNative[] = {
  {"masterVolume", "Volume", Cont},
  // VCO page
  {"vco1Wave", "VCO1 Wave", Wave1K}, {"vco1Oct", "VCO1 Octave", Oct1K}, {"vco1Tune", "VCO1 Coarse", Cont}, {"vco1Fine", "VCO1 Fine", Cont},
  {"vco1Morph", "VCO1 Morph", Cont}, {"vco1Level", "VCO1 Level", Cont}, {"vco1Pwm", "VCO1 Tilt", Cont}, {"crossModFm", "X-Mod", Cont},
  {"vco2Wave", "VCO2 Wave", Wave2K}, {"vco2Oct", "VCO2 Octave", Oct2K}, {"vco2Tune", "VCO2 Coarse", Cont}, {"vco2Fine", "VCO2 Fine", Cont},
  {"vco2Morph", "VCO2 Morph", Cont}, {"vco2Level", "VCO2 Level", Cont}, {"vco2Sync", "VCO2 Sync", SyncK}, {"ringModLevel", "Ring Mod", Cont},
  // MIX page
  {"glide", "Glide", Cont}, {"masterTune", "Master Tune", Cont}, {"unisonDetune", "Spread", Cont}, {"voiceMode", "Voice Mode", VoiceModeK},
  {"noiseLevel", "Noise", Cont}, {"noiseColor", "Noise Color", Cont}, {"vcaVelocitySens", "Velocity", Cont},
  // FILTER page
  {"hpfCutoff", "HPF Cutoff", Cont}, {"hpfResonance", "HPF Reso", Cont}, {"lpfCutoff", "LPF Cutoff", Cont}, {"lpfResonance", "LPF Reso", Cont},
  {"lpfDrive", "Drive", Cont}, {"lpfEnvAmount", "Env Amount", Cont}, {"lpfKeyTrack", "Key Track", Cont},
  // ENV page
  {"tg1Attack", "Filt Attack", Cont}, {"tg1Decay", "Filt Decay", Cont}, {"tg1Sustain", "Filt Sustain", Cont}, {"tg1Release", "Filt Release", Cont},
  {"tg2Attack", "Amp Attack", Cont}, {"tg2Decay", "Amp Decay", Cont}, {"tg2Sustain", "Amp Sustain", Cont}, {"tg2Release", "Amp Release", Cont},
  // LFO page
  {"lfoShape", "LFO Shape", LfoShapeK}, {"lfoRate", "LFO Rate", Cont}, {"lfoDelay", "LFO Delay", Cont},
  {"lfoToPitch", "LFO>Pitch", Cont}, {"lfoToFilter", "LFO>Filter", Cont}, {"lfoToMorph", "LFO>Morph", Cont},
  // FX page
  {"chorusMix", "Chorus Mix", Cont}, {"chorusRate", "Chorus Rate", Cont}, {"delayMix", "Delay Mix", Cont}, {"delayTime", "Delay Time", Cont},
  {"delayFeedback", "Feedback", Cont}, {"reverbMix", "Reverb Mix", Cont}, {"reverbDecay", "Reverb Space", Cont},
};
constexpr int kNumNative = (int)(sizeof(kNative) / sizeof(kNative[0]));
static_assert(kNumNative == kNumContinuous + 7, "every reference parameter plus 7 discrete ones");

int refIndex(const char* key) {
  for (int i = 0; i < kNumContinuous; ++i) if (std::strcmp(kParams[i].id, key) == 0) return i;
  return -1;
}
bool isPct(const ParamDef& d) { return std::strcmp(d.unit, "%") == 0; }

}  // namespace

class Audity78 : public mpc::Plugin
{
public:
    Audity78() : mpc::Plugin(makeInfo())
    {
        std::vector<std::string> waveNames;
        for (int i = 0; i < kNumWaves; ++i) waveNames.push_back(kWaves[i].name);

        for (int i = 0; i < kNumNative; ++i)
        {
            const Native& n = kNative[i];
            refIdx_[i] = (n.kind == Cont) ? refIndex(n.key) : -1;
            switch (n.kind)
            {
                case VoiceModeK: addParam(mpc::choiceParam(n.key, n.name, {"Poly", "Unison", "Mono"}, 0)); break;
                case Wave1K:     addParam(mpc::choiceParam(n.key, n.name, waveNames, 0)); break;
                case Wave2K:     addParam(mpc::choiceParam(n.key, n.name, waveNames, 1)); break;
                case Oct1K:
                case Oct2K:      addParam(mpc::intParam(n.key, n.name, -2, 2, 0)); break;
                case SyncK:      addParam(mpc::boolParam(n.key, n.name, false)); break;
                case LfoShapeK:  addParam(mpc::choiceParam(n.key, n.name, {"Sine", "Triangle", "Saw", "Square", "S&H"}, 1)); break;
                case Cont: {
                    const ParamDef& d = kParams[refIdx_[i]];
                    const bool secs = std::strcmp(d.unit, "s") == 0;
                    if (isPct(d))        addParam(mpc::floatParam(n.key, n.name, d.min * 100.0f, d.max * 100.0f, d.def * 100.0f, "%", 0));
                    else if (d.logCurve) addParam(mpc::logParam(n.key, n.name, d.min, d.max, d.def, d.unit, secs ? 2 : 0));
                    else                 addParam(mpc::floatParam(n.key, n.name, d.min, d.max, d.def, d.unit, secs ? 2 : 0));
                    break;
                }
            }
        }

        // Factory bank A (16 programs), values in native parameter order.
        for (int pi = 0; pi < kNumPrograms; ++pi)
        {
            const Program& pr = kPrograms[pi];
            std::vector<float> vals;
            vals.reserve(kNumNative);
            for (int i = 0; i < kNumNative; ++i)
            {
                switch (kNative[i].kind)
                {
                    case VoiceModeK: vals.push_back((float)pr.d.voiceMode); break;
                    case Wave1K:     vals.push_back((float)pr.d.vco1Wave); break;
                    case Wave2K:     vals.push_back((float)pr.d.vco2Wave); break;
                    case Oct1K:      vals.push_back((float)pr.d.vco1Oct); break;
                    case Oct2K:      vals.push_back((float)pr.d.vco2Oct); break;
                    case SyncK:      vals.push_back((float)pr.d.vco2Sync); break;
                    case LfoShapeK:  vals.push_back((float)pr.d.lfoShape); break;
                    case Cont: {
                        const int r = refIdx_[i];
                        vals.push_back(isPct(kParams[r]) ? pr.v[r] * 100.0f : pr.v[r]);
                        break;
                    }
                }
            }
            addProgram(pr.name, vals);
        }
    }

    void prepare(double sampleRate, int maxBlockSize) override
    {
        (void)maxBlockSize;   // the core renders any block length in control chunks
        synth_.prepare(sampleRate);
        reset();
    }

    void reset() override { synth_.reset(); }

    void process(mpc::ProcessContext& ctx) override
    {
        // Parameters -> core settings, once per block.
        Settings s;
        for (int i = 0; i < kNumNative; ++i)
        {
            switch (kNative[i].kind)
            {
                case VoiceModeK: s.voiceMode = getInt(i); break;
                case Wave1K:     s.vco1Wave = getInt(i); break;
                case Wave2K:     s.vco2Wave = getInt(i); break;
                case Oct1K:      s.vco1Oct = getInt(i); break;
                case Oct2K:      s.vco2Oct = getInt(i); break;
                case SyncK:      s.vco2Sync = getBool(i) ? 1 : 0; break;
                case LfoShapeK:  s.lfoShape = getInt(i); break;
                case Cont: {
                    const int r = refIdx_[i];
                    s.p[r] = isPct(kParams[r]) ? get(i) * 0.01f : get(i);
                    break;
                }
            }
        }
        synth_.setSettings(s);

        const int numFrames = ctx.numFrames;
        float* outL = ctx.outputs[0];
        float* outR = ctx.numOutputs > 1 ? ctx.outputs[1] : ctx.outputs[0];

        // Render in segments split at MIDI event offsets so notes start sample-accurately.
        int frame = 0, mi = 0;
        while (frame < numFrames)
        {
            while (mi < ctx.numMidiEvents && ctx.midi[mi].sampleOffset <= frame) handleMidi(ctx.midi[mi++]);
            int end = numFrames;
            if (mi < ctx.numMidiEvents) end = mpc::clamp(ctx.midi[mi].sampleOffset, frame + 1, numFrames);
            synth_.process(outL + frame, outR + frame, end - frame);
            frame = end;
        }
    }

private:
    static mpc::PluginInfo makeInfo()
    {
        mpc::PluginInfo info;
        info.name         = "Audity 78";
        info.vendor       = "Lumina Aerospace LLC";   // must match plugin.json "manufacturer"
        info.uniqueId     = MPC_FOURCC('A', 'U', '7', '8');   // must match plugin.json "uid"
        info.version      = 100;   // 0.1.0
        info.isInstrument = true;
        info.numInputs    = 0;
        info.numOutputs   = 2;
        info.tailSamples  = 0;
        return info;
    }

    void handleMidi(const mpc::MidiEvent& e)
    {
        if (e.isNoteOn())              synth_.noteOn(e.note(), e.velocity() / 127.0f);
        else if (e.isNoteOff())        synth_.noteOff(e.note());
        else if (e.isAllNotesOff())    synth_.allNotesOff();
        else if (e.isPitchBend())      synth_.pitchBend(e.pitchBend() / 8192.0f * 2.0f);
        else if (e.isController() && e.controller() == 1) synth_.modWheel(e.controllerValue() / 127.0f);
    }

    Synth synth_;
    int refIdx_[kNumNative] = {};
};

MPC_PLUGIN_ENTRY(Audity78)
