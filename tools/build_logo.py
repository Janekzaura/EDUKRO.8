"""
Generuje kaligraficzne logo EDUKRO jako SVG z danymi do animacji „pisania piórem”.

Źródło liter: TeX Gyre Chorus (klon kancelaryjnej kaligrafii Zapf Chancery,
licencja GUST Font License – pozwala na osadzanie i modyfikację).

Jak to działa:
  1. Kontury liter są pobierane z fontu jako ścieżki SVG (wypełnienie = „atrament”).
  2. Każda litera jest rasteryzowana, a z obrazu liczony jest szkielet (linia środkowa
     pociągnięcia). Szkielet zamieniany jest na kolejne pociągnięcia pióra.
  3. W przeglądarce pociągnięcia rysowane są w masce (stroke-dashoffset), więc atrament
     pojawia się dokładnie tam, gdzie „przesuwa się” pióro – to nie jest fade-in.
  4. Na końcu dorysowany jest długi zawijas szerokim piórem (zmienna grubość zależna od
     kąta stalówki), który wychodzi z litery O i wybiega poza szerokość słowa.

Uruchomienie:  python3 tools/build_logo.py   → public/assets/logo.svg
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageChops
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from skimage.morphology import skeletonize, remove_small_holes
from scipy.ndimage import distance_transform_edt

FONT = '/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyrechorus-mediumitalic.otf'
WORD = 'EDUKRO'
TRACK = [0, -10, -30, -25, -10, -30]   # korekta odstępów (jednostki fontu) przed literą
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'logo.svg')
RS = 0.8          # piksele rastra na jednostkę fontu (do szkieletu)


class Pen(BasePen):
    """Zbiera ścieżkę SVG oraz spłaszczone kontury (wielokąty)."""
    def __init__(self, gs, ox):
        super().__init__(gs)
        self.d, self.polys, self.cur, self.ox = [], [], [], ox
    def T(self, p):  # jednostki fontu -> współrzędne SVG (y w dół)
        return (p[0] + self.ox, -p[1])
    def _moveTo(self, p):
        q = self.T(p); self.d.append(f'M{q[0]:.1f} {q[1]:.1f}'); self.cur = [q]
    def _lineTo(self, p):
        q = self.T(p); self.d.append(f'L{q[0]:.1f} {q[1]:.1f}'); self.cur.append(q)
    def _curveToOne(self, p1, p2, p3):
        a = self.cur[-1]; b, c, e = self.T(p1), self.T(p2), self.T(p3)
        self.d.append(f'C{b[0]:.1f} {b[1]:.1f} {c[0]:.1f} {c[1]:.1f} {e[0]:.1f} {e[1]:.1f}')
        for i in range(1, 17):
            t = i / 16; m = 1 - t
            self.cur.append((m**3*a[0]+3*m*m*t*b[0]+3*m*t*t*c[0]+t**3*e[0],
                             m**3*a[1]+3*m*m*t*b[1]+3*m*t*t*c[1]+t**3*e[1]))
    def _closePath(self):
        self.d.append('Z'); self.polys.append(self.cur); self.cur = []
    _endPath = _closePath


def raster(polys, x0, y0, w, h):
    """Rasteryzacja z regułą even-odd (XOR konturów)."""
    acc = Image.new('1', (w, h), 0)
    for poly in polys:
        im = Image.new('1', (w, h), 0)
        ImageDraw.Draw(im).polygon([((x - x0) * RS, (y - y0) * RS) for x, y in poly], fill=1)
        acc = ImageChops.logical_xor(acc, im)
    return np.array(acc, dtype=bool)


N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def trace(skel):
    pts = set(zip(*np.nonzero(skel)))
    nb = {p: [(p[0]+a, p[1]+b) for a, b in N8 if (p[0]+a, p[1]+b) in pts] for p in pts}
    nodes = {p for p in pts if len(nb[p]) != 2}
    edges, used = [], set()
    def walk(a, b):
        path = [a, b]
        while path[-1] not in nodes:
            nxt = [q for q in nb[path[-1]] if q != path[-2] and (path[-1], q) not in used]
            if not nxt: break
            # preferuj sąsiadów 4-spójnych (unikamy skrótów po przekątnej)
            nxt.sort(key=lambda q: abs(q[0]-path[-1][0]) + abs(q[1]-path[-1][1]))
            used.add((path[-1], nxt[0])); used.add((nxt[0], path[-1]))
            path.append(nxt[0])
            if path[-1] == a: break
        return path
    for n in nodes:
        for m in nb[n]:
            if (n, m) in used: continue
            used.add((n, m)); used.add((m, n))
            edges.append(walk(n, m))
    # pętle bez węzłów (np. zamknięte O)
    seen = {p for e in edges for p in e}
    for p in pts:
        if p in seen or len(nb[p]) != 2: continue
        a, b = p, nb[p][0]
        used.add((a, b)); used.add((b, a))
        e = walk(a, b)
        seen |= set(e)
        edges.append(e)
    return edges, nb


def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a; L = np.hypot(*ab)
    d = [abs(ab[0]*(p[1]-a[1]) - ab[1]*(p[0]-a[0])) / L if L else np.hypot(*(np.array(p) - a)) for p in pts]
    i = int(np.argmax(d))
    if d[i] > eps:
        return rdp(pts[:i+1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]


def smooth_path(pts):
    """Catmull-Rom → krzywe Béziera."""
    if len(pts) == 2:
        return f'M{pts[0][0]:.1f} {pts[0][1]:.1f}L{pts[1][0]:.1f} {pts[1][1]:.1f}'
    d = [f'M{pts[0][0]:.1f} {pts[0][1]:.1f}']
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = map(np.array, P[i-1:i+3])
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        d.append(f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}')
    return ''.join(d)


def plen(pts):
    return sum(math.dist(pts[i], pts[i+1]) for i in range(len(pts) - 1))


def glyph_strokes(polys):
    xs = [x for p in polys for x, _ in p]; ys = [y for p in polys for _, y in p]
    x0, y0 = min(xs) - 20, min(ys) - 20
    w, h = int((max(xs) - x0 + 20) * RS), int((max(ys) - y0 + 20) * RS)
    m = raster(polys, x0, y0, w, h)
    m = remove_small_holes(m, max_size=30)
    dist = distance_transform_edt(m)
    edges, nb = trace(skeletonize(m))
    # usuń krótkie „ostrogi” kończące się w ślepym punkcie
    deg = {p: len(nb[p]) for p in nb}
    def is_spur(e):
        ends = [e[0], e[-1]]
        return any(deg.get(q) == 1 for q in ends) and any(deg.get(q, 0) >= 3 for q in ends) \
            and len(e) < 1.6 * max(dist[q] for q in e)
    edges = [e for e in edges if len(e) > 3 and not is_spur(e)]
    to_xy = lambda q: (q[1] / RS + x0, q[0] / RS + y0)

    # Łączenie krawędzi w pociągnięcia: zaczynamy od lewego-górnego końca,
    # kontynuujemy najbardziej „prostą” krawędzią, przy braku – podnosimy pióro.
    rem = [list(e) for e in edges]
    strokes = []
    def key_start(e):
        return min(e[0][1] + 0.4 * e[0][0], e[-1][1] + 0.4 * e[-1][0])
    while rem:
        if strokes:
            last = strokes[-1]['pix'][-1]
            e = min(rem, key=lambda e: min(math.dist(last, e[0]), math.dist(last, e[-1])) + 0.5 * key_start(e))
        else:
            e = min(rem, key=key_start)
        rem.remove(e)
        if e[-1][1] + 0.4 * e[-1][0] < e[0][1] + 0.4 * e[0][0] - 2: e = e[::-1]
        chain = list(e)
        while True:
            end = chain[-1]
            head = np.subtract(chain[-1], chain[max(0, len(chain) - 8)])
            cands = []
            for c in rem:
                for cc in (c, c[::-1]):
                    if math.dist(cc[0], end) <= 2.5:
                        d0 = np.subtract(cc[min(7, len(cc) - 1)], cc[0])
                        cos = np.dot(head, d0) / ((np.hypot(*head) * np.hypot(*d0)) or 1)
                        cands.append((cos, c, cc))
            cands = [c for c in cands if c[0] > -0.2]
            if not cands: break
            cos, c, cc = max(cands, key=lambda t: t[0])
            rem.remove(c); chain += cc[1:]
        width = 2 * max(dist[q] for q in chain) / RS + 10
        strokes.append({'pix': chain, 'width': width})
    out = []
    for s in strokes:
        pts = rdp([to_xy(q) for q in s['pix']], 1.0 / RS)
        if plen(pts) < 6: continue
        out.append({'d': smooth_path(pts), 'w': round(s['width'], 1), 'len': round(plen(pts), 1)})
    return out


def broad_nib(center, max_w=64, base_w=24, min_w=3):
    """Zawijas kreślony elastyczną stalówką: grubszy na pociągnięciach w dół,
    cienki na poziomych i w górę, z łagodnym zwężeniem na obu końcach."""
    L, R = [], []
    N = len(center)
    for i, p in enumerate(center):
        t = i / (N - 1)
        a, b2 = center[max(0, i - 1)], center[min(N - 1, i + 1)]
        tg = np.subtract(b2, a); tg = tg / (np.hypot(*tg) or 1)
        down = max(0.0, tg[1]) ** 1.3
        taper = min(1.0, t / 0.05) * (1.0 if t < 0.55 else max(0.0, (1 - t) / 0.45) ** 0.9)
        w = min_w + (base_w + (max_w - base_w) * down) * taper
        n = np.array([-tg[1], tg[0]]) * (w / 2)
        L.append(np.array(p) + n); R.append(np.array(p) - n)
    poly = L + R[::-1]
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in poly) + 'Z'


def bez(p0, p1, p2, p3, n=60):
    return [tuple((1-t)**3*np.array(p0)+3*(1-t)**2*t*np.array(p1)+3*(1-t)*t*t*np.array(p2)+t**3*np.array(p3))
            for t in np.linspace(0, 1, n)]


def main():
    f = TTFont(FONT); gs = f.getGlyphSet(); cmap = f.getBestCmap()
    x = 0; letters = []
    for i, ch in enumerate(WORD):
        g = cmap[ord(ch)]; x += TRACK[i]
        pen = Pen(gs, x); gs[g].draw(pen)
        letters.append({'ch': ch, 'd': ''.join(pen.d), 'polys': pen.polys, 'x': x, 'adv': f['hmtx'][g][0]})
        x += f['hmtx'][g][0]
    allx = [p[0] for L in letters for poly in L['polys'] for p in poly]
    ally = [p[1] for L in letters for poly in L['polys'] for p in poly]
    wx0, wx1, wy0, wy1 = min(allx), max(allx), min(ally), max(ally)

    # --- Zawijas: wychodzi z prawego dołu litery O, zawraca pod słowem
    #     i wybiega w lewo poza literę E, kończąc się włosową kreską.
    O = letters[-1]
    ox = [p[0] for poly in O['polys'] for p in poly]; oy = [p[1] for poly in O['polys'] for p in poly]
    o_x0, o_x1, o_y1 = min(ox), max(ox), max(oy)
    base = 0  # linia bazowa
    # start z prawego boku O (koniec pociągnięcia litery), zejście w dół przy literze,
    # zawrót pod słowem i długa linia wybiegająca w lewo poza literę E.
    o_y0 = min(oy); o_h = o_y1 - o_y0
    s = (o_x1 - 16, o_y0 + o_h * 0.50)
    c = bez(s, (o_x1 + 10, o_y0 + o_h * 0.78), (o_x1 + 40, base + 70), (o_x1 - 40, base + 150), 45)
    c += bez(c[-1], (o_x1 - 110, base + 210), (o_x1 - 330, base + 222), (o_x1 - 600, base + 205), 50)[1:]
    c += bez(c[-1], (wx1 * 0.55, base + 190), (wx1 * 0.30, base + 215), (wx1 * 0.12, base + 205), 70)[1:]
    c += bez(c[-1], (wx0 + 150, base + 198), (wx0 - 60, base + 185), (wx0 - 240, base + 120), 50)[1:]
    swash_center = c
    swash_fill = broad_nib(swash_center)
    swash_len = plen(swash_center)
    swash_d = smooth_path(rdp(swash_center, 0.6))

    pad = 40
    vx0 = min(wx0, min(p[0] for p in c)) - pad - 30
    vx1 = max(wx1, max(p[0] for p in c)) + pad
    vy0 = wy0 - pad
    vy1 = max(wy1, max(p[1] for p in c)) + pad
    vb = (round(vx0), round(vy0), round(vx1 - vx0), round(vy1 - vy0))

    glyphs = []
    for L in letters:
        strokes = glyph_strokes(L['polys'])
        glyphs.append({'ch': L['ch'], 'd': L['d'], 'strokes': strokes})
        print(L['ch'], len(strokes), 'pociągnięć', file=sys.stderr)

    # --- SVG
    o = []
    o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" '
             f'class="edukro-logo" role="img" aria-labelledby="edukro-logo-title">')
    o.append('<title id="edukro-logo-title">EDUKRO</title><defs>')
    for i, gph in enumerate(glyphs):
        o.append(f'<mask id="lm{i}" maskUnits="userSpaceOnUse" x="{vb[0]}" y="{vb[1]}" width="{vb[2]}" height="{vb[3]}">')
        for s in gph['strokes']:
            o.append(f'<path class="pen" d="{s["d"]}" stroke-width="{s["w"]}" data-len="{s["len"]}" '
                     f'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"/>')
        o.append('</mask>')
    o.append(f'<mask id="lms" maskUnits="userSpaceOnUse" x="{vb[0]}" y="{vb[1]}" width="{vb[2]}" height="{vb[3]}">'
             f'<path class="pen" d="{swash_d}" stroke-width="60" data-len="{round(swash_len,1)}" '
             f'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"/></mask>')
    o.append('</defs><g class="ink" fill="#EDE6D6">')
    for i, gph in enumerate(glyphs):
        o.append(f'<path class="glyph" data-ch="{gph["ch"]}" mask="url(#lm{i})" d="{gph["d"]}"/>')
    o.append(f'<path class="swash" mask="url(#lms)" d="{swash_fill}"/>')
    o.append('</g></svg>')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w').write(''.join(o))
    print('zapisano', OUT, 'viewBox', vb, file=sys.stderr)


if __name__ == '__main__':
    main()
