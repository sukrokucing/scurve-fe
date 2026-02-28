export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function wrapHue(hue) {
    const wrapped = hue % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

function linearToSrgb(channel) {
    if (channel <= 0.0031308) {
        return 12.92 * channel;
    }
    return 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

function srgbToLinear(channel) {
    if (channel <= 0.04045) {
        return channel / 12.92;
    }
    return Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function oklchToSrgb(color) {
    const h = wrapHue(color.h) * (Math.PI / 180);
    const a = color.c * Math.cos(h);
    const b = color.c * Math.sin(h);

    const l_ = color.l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = color.l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = color.l - 0.0894841775 * a - 1.291485548 * b;

    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;

    const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

    return {
        r: clamp(linearToSrgb(rLin), 0, 1),
        g: clamp(linearToSrgb(gLin), 0, 1),
        b: clamp(linearToSrgb(bLin), 0, 1),
    };
}

export function rgbToHsl(rgb) {
    const r = rgb.r;
    const g = rgb.g;
    const b = rgb.b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    const lightness = (max + min) / 2;
    let hue = 0;
    let saturation = 0;

    if (delta > 0) {
        saturation = delta / (1 - Math.abs(2 * lightness - 1));
        switch (max) {
            case r:
                hue = 60 * (((g - b) / delta) % 6);
                break;
            case g:
                hue = 60 * ((b - r) / delta + 2);
                break;
            default:
                hue = 60 * ((r - g) / delta + 4);
                break;
        }
    }

    return {
        h: wrapHue(hue),
        s: saturation * 100,
        l: lightness * 100,
    };
}

export function toHslTriplet(hsl, precision = 1) {
    const h = Number(hsl.h.toFixed(precision));
    const s = Number(hsl.s.toFixed(precision));
    const l = Number(hsl.l.toFixed(precision));
    return `${h} ${s}% ${l}%`;
}

export function oklchToHslTriplet(color, precision = 1) {
    return toHslTriplet(rgbToHsl(oklchToSrgb(color)), precision);
}

export function shiftLightness(color, delta) {
    return {
        ...color,
        l: clamp(color.l + delta, 0.02, 0.98),
    };
}

export function relativeLuminanceFromSrgb(rgb) {
    const r = srgbToLinear(clamp(rgb.r, 0, 1));
    const g = srgbToLinear(clamp(rgb.g, 0, 1));
    const b = srgbToLinear(clamp(rgb.b, 0, 1));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foregroundRgb, backgroundRgb) {
    const fg = relativeLuminanceFromSrgb(foregroundRgb);
    const bg = relativeLuminanceFromSrgb(backgroundRgb);
    const lighter = Math.max(fg, bg);
    const darker = Math.min(fg, bg);
    return (lighter + 0.05) / (darker + 0.05);
}

export function hslTripletToRgb(triplet) {
    const match = triplet.trim().match(
        /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/
    );
    if (!match) {
        throw new Error(`Invalid HSL triplet: "${triplet}"`);
    }

    const hue = wrapHue(Number(match[1])) / 360;
    const saturation = clamp(Number(match[2]) / 100, 0, 1);
    const lightness = clamp(Number(match[3]) / 100, 0, 1);

    if (saturation === 0) {
        return { r: lightness, g: lightness, b: lightness };
    }

    const q =
        lightness < 0.5
            ? lightness * (1 + saturation)
            : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;

    const hueToRgb = (t) => {
        let value = t;
        if (value < 0) value += 1;
        if (value > 1) value -= 1;
        if (value < 1 / 6) return p + (q - p) * 6 * value;
        if (value < 1 / 2) return q;
        if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
        return p;
    };

    return {
        r: hueToRgb(hue + 1 / 3),
        g: hueToRgb(hue),
        b: hueToRgb(hue - 1 / 3),
    };
}
