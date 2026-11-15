"""logo de lotestigo dibujado con código: tres capas planas (lote, radar, suelo), sin estrellas ni trazo rojo

uso, desde la raíz del repo: python3 assets/draw-logo.py .
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

def hexc(h, a=255):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (a,)

def rounded(poly, size, radius):
    """polígono con esquinas redondeadas: se dibuja, se desenfoca y se vuelve a cortar"""
    m = Image.new('L', size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
    return m.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: 255 if v > 127 else 0)

def slab(img, cx, cy, w, h, t, top, left, right, stripes=None, rad=22):
    size = img.size
    L, T, R, B = (cx - w, cy), (cx, cy - h), (cx + w, cy), (cx, cy + h)
    sides = [(L, B, (B[0], B[1] + t), (L[0], L[1] + t), left), (B, R, (R[0], R[1] + t), (B[0], B[1] + t), right)]
    full = rounded([L, T, R, (R[0], R[1] + t), (B[0], B[1] + t), (L[0], L[1] + t)], size, rad)
    body = Image.new('RGBA', size, (0, 0, 0, 0)); d = ImageDraw.Draw(body)
    for *pts, col in sides: d.polygon(pts, fill=col)
    d.polygon([L, T, R, B], fill=top)
    if stripes:  # surcos del lote: líneas paralelas a un lado del rombo
        col, n, wid = stripes
        for i in range(1, n + 1):
            f = i / (n + 1)
            a = (L[0] + (T[0] - L[0]) * f, L[1] + (T[1] - L[1]) * f)
            b = (B[0] + (R[0] - B[0]) * f, B[1] + (R[1] - B[1]) * f)
            k = 0.09
            a, b = (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k), (b[0] - (b[0] - a[0]) * k, b[1] - (b[1] - a[1]) * k)
            d.line([a, b], fill=col, width=wid)
    topmask = rounded([L, T, R, B], size, rad)
    clip = Image.new('L', size, 0); clip.paste(full, (0, 0))
    out = Image.new('RGBA', size, (0, 0, 0, 0)); out.paste(body, (0, 0), clip)
    # el borde superior redondeado manda sobre los costados
    topimg = Image.new('RGBA', size, (0, 0, 0, 0)); topimg.paste(body, (0, 0), topmask)
    img.alpha_composite(out); img.alpha_composite(topimg)

def mark(W=1400, H=1600):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cx, w = W // 2, 640; h = int(w * 0.56); t = 110; gap = 280
    top0 = 40 + h
    slab(img, cx, top0 + 2 * gap, w, h, t, hexc('#23885a'), hexc('#1a6b46'), hexc('#135437'))
    slab(img, cx, top0 + gap, w, h, t, hexc('#f3f5f1'), hexc('#d3d8cf'), hexc('#bcc3b8'))
    slab(img, cx, top0, w, h, t, hexc('#1f5aa6'), hexc('#184880'), hexc('#123a69'), stripes=(hexc('#3f7cc8'), 4, 46))
    bbox = img.getbbox(); return img.crop(bbox)

def fit(m, box, pad, bg=None):
    W, H = box; s = min((W - 2 * pad) / m.width, (H - 2 * pad) / m.height)
    r = m.resize((round(m.width * s), round(m.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', box, bg or (0, 0, 0, 0))
    out.alpha_composite(r, ((W - r.width) // 2, (H - r.height) // 2)); return out

if __name__ == '__main__':
    root = sys.argv[1]; m = mark(); bg = hexc('#f4f6f3')
    fit(m, (478, 522), 0).save(f'{root}/assets/lotestigo.png')
    for s, (w, hh) in {32: (28, 32), 64: (56, 64), 96: (84, 96)}.items():
        fit(m, (w, hh), 0).save(f'{root}/frontend/public/lotestigo-mark-{s}.png')
    fit(m, (512, 512), 26).save(f'{root}/frontend/public/icon-512.png')
    fit(m, (192, 192), 10).save(f'{root}/frontend/public/icon-192.png')
    fit(m, (512, 512), 92, bg).convert('RGB').save(f'{root}/frontend/public/icon-maskable-512.png')
    fit(m, (180, 180), 18, bg).convert('RGB').save(f'{root}/frontend/public/apple-touch-icon.png')
    fit(m, (32, 32), 1).save(f'{root}/frontend/public/favicon-32.png')
    fit(m, (256, 256), 8).save(f'{root}/frontend/public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
