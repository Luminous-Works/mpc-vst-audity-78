#!/usr/bin/env python3
"""make_blue_skin.py - give Audity '78 its own MPC screen: the blue L.A. front panel.

Audity 0.1.0 shipped on the SDK's generated "amber" skin (black, amber, plain sliders). This script restyles it in
the language of the reference emulator's panel (src/components/HardwarePanel.tsx): a light-blue plate in a walnut
frame, navy module cards behind each Q-Link block, silver knobs with a cyan value arc, navy faders and buttons.

WHAT IT MAKES (into <out>, the plugin's skins/ folder, which tools/build.py then copies verbatim)
  knob_uni.png / knob_bi.png        90 x 90, 127 frames   silver cap, pointer, cyan arc on a navy ring
  fader_h_uni.png                   248 x 36, 127 frames  navy track, cyan fill, silver cap
  toggle_on/off.png, seg3_on/off    the SDK kit's sizes   cyan-lit buttons on navy
  bg_<PAGE>.png (one per page)      1280 x 628            plate + frame + a card behind each row of controls, with the
                                                          module name (VCO 1, LPF SSM2040, ...) painted on the card
FRAME ORDER: frame 0 is the minimum and it is at the TOP of the strip (the SDK's rule); the bipolar strip has its
centre at frame 63 of 127. Text (names, values) is drawn by the MPC in its own font; its colours come from ui.json
"style" (white text, pale-blue muted text), so they read on the navy cards.

PIPELINE (<P> = this project folder, SDK = mpc-plugin-builder-sdk next to it; the plugin .so is NOT rebuilt):
    python SDK/tools/gen_ui.py --params <P>/build/params.json --ui <P>/ui.json --out <tmp> --kit-cache <P>/build
    python <P>/tools/make_blue_skin.py <tmp> <P>/skins
    (then copy <P>/skins over "<P>/build/<Maker - VST - Name>/Plugin Skins" for a preview or a package)
No third-party name, logo or artwork is used; the look is original to L.A. Systems.
"""
import math
import os
import re
import shutil
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import skin_fix as sf  # noqa: E402

FRAMES, KNOB = 127, 90
FADER_W, FADER_H = 248, 36
SS = 4
ARC_START, ARC_SWEEP = 135.0, 270.0

PLATE_TOP, PLATE_BOT = (126, 182, 226), (92, 150, 204)
NAVY, NAVY_EDGE, NAVY_DK = (17, 52, 112), (40, 88, 160), (9, 30, 70)
CYAN = (110, 214, 255)
SILVER_HI, SILVER_LO = (236, 240, 246), (150, 160, 176)
WOOD_A, WOOD_B = (122, 74, 40), (86, 50, 26)
AMBER = (255, 176, 32)

# module names painted on the cards, per page, one per row of controls that has any (top to bottom)
TITLES = {
    "VCO": ["VCO 1  ·  SSM sawtooth", "VCO 1  ·  wave / tune", "VCO 2  ·  L.A. wavetable", "VCO 2  ·  wave / tune / sync"],
    "MIX": ["OUTPUT", "NOISE  ·  VOICES"],
    "FILTER": ["LPF SSM2040  ·  24 dB", "LPF SSM2040  ·  envelope", "HPF  ·  12 dB"],
    "ENV": ["TG1  ·  FILTER", "TG2  ·  AMP"],
    "LFO": ["LFO", "LFO  ·  SHAPE"],
    "FX": ["RF  ·  CHORUS", "RF  ·  DELAY", "RF  ·  REVERB"],
}


def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def glow(fn, blur, size):
    lay = Image.new("RGBA", size, (0, 0, 0, 0))
    fn(ImageDraw.Draw(lay))
    return lay.filter(ImageFilter.GaussianBlur(blur))


# ----------------------------------------------------------------------------------------------- controls
def knob_frame(norm, bipolar):
    S = KNOB * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    emis = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    di, de = ImageDraw.Draw(img), ImageDraw.Draw(emis)
    c = S / 2.0
    r = c - 3.0 * SS
    di.ellipse((c - r, c - r, c + r, c + r), fill=NAVY_DK, outline=NAVY_EDGE, width=SS)      # the ring it sits in
    tr = r - 5.0 * SS
    tb = (c - tr, c - tr, c + tr, c + tr)
    di.arc(tb, ARC_START, ARC_START + ARC_SWEEP, fill=(40, 70, 120, 255), width=2 * SS)       # the track
    if bipolar:
        mid = ARC_START + ARC_SWEEP / 2
        a = mid + (norm - 0.5) * ARC_SWEEP
        a0, a1 = (mid, a) if norm >= 0.5 else (a, mid)
    else:
        a0, a1 = ARC_START, ARC_START + ARC_SWEEP * norm
    if abs(a1 - a0) > 0.4:
        for d in (di, de):
            d.arc(tb, a0, a1, fill=CYAN + (255,), width=3 * SS)
    # silver cap with a vertical sheen, then the pointer
    cr = tr - 7.0 * SS
    cap = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cap)
    for i in range(int(2 * cr)):
        t = i / (2 * cr)
        col = tuple(int(SILVER_HI[k] * (1 - t) + SILVER_LO[k] * t) for k in range(3)) + (255,)
        cd.line((c - cr, c - cr + i, c + cr, c - cr + i), fill=col)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse((c - cr, c - cr, c + cr, c + cr), fill=255)
    img.paste(cap, (0, 0), mask)
    di.ellipse((c - cr, c - cr, c + cr, c + cr), outline=(70, 80, 100, 255), width=SS)
    ang = a1 if not bipolar else ARC_START + ARC_SWEEP * norm
    x0, y0 = polar(c, c, cr * 0.25, ang)
    x1, y1 = polar(c, c, cr * 0.92, ang)
    di.line((x0, y0, x1, y1), fill=(20, 36, 70, 255), width=3 * SS)
    out = Image.alpha_composite(emis.filter(ImageFilter.GaussianBlur(2.2 * SS)), img)
    return out.resize((KNOB, KNOB), Image.LANCZOS)


def fader_frame(norm):
    w, h = FADER_W * SS, FADER_H * SS
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    emis = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    di, de = ImageDraw.Draw(img), ImageDraw.Draw(emis)
    ty, x0, x1 = h // 2, 10 * SS, w - 10 * SS
    di.rounded_rectangle((x0, ty - 3 * SS, x1, ty + 3 * SS), radius=3 * SS, fill=NAVY_DK, outline=NAVY_EDGE, width=SS)
    cx = int(x0 + norm * (x1 - x0))
    if cx > x0 + 2 * SS:
        for d in (di, de):
            d.rounded_rectangle((x0, ty - 2 * SS, cx, ty + 2 * SS), radius=2 * SS, fill=CYAN + (255,))
    # silver cap
    cw, ch = 9 * SS, 13 * SS
    for i in range(2 * ch):
        t = i / (2 * ch)
        col = tuple(int(SILVER_HI[k] * (1 - t) + SILVER_LO[k] * t) for k in range(3)) + (255,)
        di.line((cx - cw, ty - ch + i, cx + cw, ty - ch + i), fill=col)
    di.rectangle((cx - cw, ty - ch, cx + cw, ty + ch), outline=(70, 80, 100, 255), width=SS)
    di.line((cx, ty - ch + 3 * SS, cx, ty + ch - 3 * SS), fill=(20, 36, 70, 255), width=2 * SS)
    out = Image.alpha_composite(emis.filter(ImageFilter.GaussianBlur(2.5 * SS)), img)
    return out.resize((FADER_W, FADER_H), Image.LANCZOS)


def strip(frame_fn, w, h):
    s = Image.new("RGBA", (w, h * FRAMES), (0, 0, 0, 0))
    for f in range(FRAMES):
        s.paste(frame_fn(f / (FRAMES - 1.0)), (0, f * h))
    return s


def button(path, size, on, pill):
    w, h = size[0] * SS, size[1] * SS
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    box = (2 * SS, 4 * SS, w - 3 * SS, h - 5 * SS)
    rad = (h - 9 * SS) // 2 if pill else 4 * SS
    if on:
        img.alpha_composite(glow(lambda dd: dd.rounded_rectangle(box, radius=rad, fill=CYAN + (255,)), 3 * SS, (w, h)))
        d.rounded_rectangle(box, radius=rad, fill=(24, 108, 168, 255), outline=CYAN + (255,), width=SS)
        if pill:
            d.ellipse((w - 22 * SS, 9 * SS, w - 9 * SS, h - 10 * SS), fill=SILVER_HI + (255,))
    else:
        d.rounded_rectangle(box, radius=rad, fill=NAVY_DK + (255,), outline=NAVY_EDGE + (255,), width=SS)
        if pill:
            d.ellipse((8 * SS, 9 * SS, 21 * SS, h - 10 * SS), fill=(110, 130, 165, 255))
    img.resize(size, Image.LANCZOS).save(path, optimize=True)


# ----------------------------------------------------------------------------------------------- backgrounds
def font(size, bold=True):
    for f in ("segoeuib.ttf" if bold else "segoeui.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"):
        for base in ("C:/Windows/Fonts/", ""):
            try:
                return ImageFont.truetype(base + f, size)
            except OSError:
                pass
    return ImageFont.load_default()


def plate():
    w, h = 1280, 628
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line((0, y, w, y), fill=tuple(int(PLATE_TOP[k] * (1 - t) + PLATE_BOT[k] * t) for k in range(3)))
    # walnut frame, 14 px, with a grain
    for x in range(w):
        t = (math.sin(x * 0.07) + 1) / 4
        col = tuple(int(WOOD_A[k] * (1 - t) + WOOD_B[k] * t) for k in range(3))
        d.line((x, 0, x, 13), fill=col)
        d.line((x, h - 14, x, h), fill=col)
    for y in range(h):
        d.line((0, y, 13, y), fill=WOOD_B)
        d.line((w - 14, y, w, y), fill=WOOD_B)
    d.rectangle((14, 14, w - 15, h - 15), outline=(50, 96, 150), width=2)
    return img


def row_clusters(boxes):
    """group control bounds (x, y, w, h) into rows by vertical centre"""
    rows = []
    for b in sorted(boxes, key=lambda b: b[1] + b[3] / 2):
        cy = b[1] + b[3] / 2
        if rows and abs(cy - rows[-1]["cy"]) < 45:
            rows[-1]["boxes"].append(b)
            rows[-1]["cy"] = sum(x[1] + x[3] / 2 for x in rows[-1]["boxes"]) / len(rows[-1]["boxes"])
        else:
            rows.append({"cy": cy, "boxes": [b]})
    return rows


def page_background(name, boxes, path):
    img = plate().convert("RGBA")
    rows = row_clusters(boxes)
    titles = TITLES.get(name, [])
    f = font(15)
    for i, r in enumerate(rows):
        x0, x1 = 24, 1256                       # every card the full width of the plate
        y0 = int(min(b[1] for b in r["boxes"]) - 27)    # a title band above the controls' captions
        y1 = int(max(b[1] + b[3] for b in r["boxes"]) + 6)
        y0, y1 = max(20, y0), min(606, y1)
        shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle((x0 + 2, y0 + 5, x1 + 2, y1 + 5), radius=10, fill=(0, 20, 60, 120))
        img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5)))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((x0, y0, x1, y1), radius=10, fill=NAVY + (255,), outline=NAVY_EDGE + (255,), width=2)
        d.line((x0 + 14, y0 + 28, x1 - 14, y0 + 28), fill=(40, 88, 160, 255), width=1)
        if i < len(titles) and titles[i]:
            tw = d.textlength(titles[i], font=f)
            d.text((x0 + 18, y0 + 8), titles[i], font=f, fill=(150, 200, 245, 255))
    ImageDraw.Draw(img).text((34, 604 - 2 - 0), "", font=f)
    d = ImageDraw.Draw(img)
    brand = "AUDITY  L.A."
    f2 = font(13)
    d.text((1256 - d.textlength(brand, font=f2) - 6, 608), brand, font=f2, fill=(20, 54, 110, 255))
    img.convert("RGB").save(path, optimize=True)


def main():
    src, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    if os.path.isdir(out):
        shutil.rmtree(out)
    shutil.copytree(src, out)
    for f in os.listdir(out):
        if f.lower().endswith(".svg"):
            os.remove(os.path.join(out, f))
    # control art, in the sizes the kit used
    strip(lambda n: knob_frame(n, False), KNOB, KNOB).save(os.path.join(out, "knob_uni.png"), optimize=True)
    strip(lambda n: knob_frame(n, True), KNOB, KNOB).save(os.path.join(out, "knob_bi.png"), optimize=True)
    strip(fader_frame, FADER_W, FADER_H).save(os.path.join(out, "fader_h_uni.png"), optimize=True)
    # TUI.json is patched as TEXT-faithful objects (it has duplicate "version" keys that json would destroy)
    p = os.path.join(out, "TUI.json")
    root = sf.load(p)
    n_menu = sf.fix_menus(root, "ff6ed6ff")
    sf.make_translucent_segments(out, CYAN)
    n_img, n_move = sf.fix_segments(root)
    for name in ("seg3_on", "seg3_off"):
        pth = os.path.join(out, name + ".png")
        if os.path.exists(pth):
            button(pth, Image.open(pth).size, name.endswith("_on"), False)
    for name in ("toggle_on", "toggle_off"):
        button(os.path.join(out, name + ".png"), (64, 32), name.endswith("_on"), True)
    for tab in sf.tabs(root):
        tname = sf.get(tab, "tabName") or "page"
        boxes = []
        for c in sf.tab_children(tab):
            b = sf.get(sf.get(c, "bounds"), "bounds")
            if b:
                v = [float(t) for t in b.split()]
                if len(v) == 4 and v[2] > 40 and v[3] > 40 and v[2] < 700:
                    boxes.append(tuple(v))
        fn = "bg_%s.png" % re.sub(r"\W", "", str(tname))
        page_background(str(tname), boxes, os.path.join(out, fn))
        bg = sf.get(sf.get(tab, "componentDefinition"), "backgroundData")
        for side in ("focussed", "unfocussed"):
            sf.put(sf.get(bg, side), "image", fn)
        print("page", tname, "rows:", len(row_clusters(boxes)), "->", fn)
    sf.save(root, p)
    print("blue skin written to", out, "| menus:", n_menu, "| captions moved:", n_move)


if __name__ == "__main__":
    main()
