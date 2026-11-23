# Third-party notices

Audity '78 is MIT licensed (see LICENSE, Copyright (c) 2026 Lumina Aerospace LLC).

## MPC Plugin SDK wrapper

The compiled plugin (`VST/audity-78-arm32.so`, `VST/audity-78-arm64.so`) links the wrapper code of the
MPC Plugin SDK, https://github.com/inmusic-software/mpc-plugin-builder-sdk, which is MIT licensed:

    MIT License
    
    Copyright (c) 2026 inMusic Brands, Inc.
    
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    
    "VST" is a trademark of Steinberg Media Technologies GmbH. "MPC" and "Akai
    Professional" are trademarks of inMusic Brands, Inc. This SDK contains no code
    from Steinberg's VST SDK.

## Sound content

All wavetables are synthesised in code (src/data/wavetables.ts). No third-party ROM, sample or sound
data is included. Audity '78 is an independent project by Lumina Aerospace LLC and is not affiliated
with the makers of the instruments that inspired it.
