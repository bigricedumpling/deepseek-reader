"""Render the three original Typocket ink covers. Requires Pillow, only at authoring time."""
import argparse
import math
import random
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

W, H, SS = 2400, 400, 3
LEFT = 600
PAPER = '#f3f0e7'
INK = '#323432'
GRAPHITE = '#676960'
PENCIL = '#a9a99a'
BLUE = '#385c9d'
PAPER_LIGHT = '#f7f4ed'
PAPER_BACK = '#eae8dd'


def path_points(path):
    """Sample the line and cubic segments in the drawing's own paper coordinates."""
    tokens = iter(re.findall(r'[MLCZ]|-?(?:\d+\.?\d*|\.\d+)', path))
    points = []
    for cmd in tokens:
        if cmd == 'Z':
            points.append(points[0])
            continue
        vals = [float(next(tokens)) for _ in range(6 if cmd == 'C' else 2)]
        end = tuple(vals[-2:])
        if cmd == 'M':
            points.append(end)
            continue
        start = points[-1]
        if cmd == 'L':
            count = max(1, math.ceil(math.dist(start, end) / 2.2))
            for n in range(1, count + 1):
                t = n / count
                points.append(tuple(a + (b-a)*t for a,b in zip(start, end)))
        else:
            p, q = tuple(vals[:2]), tuple(vals[2:4])
            count = max(5, math.ceil((math.dist(start,p)+math.dist(p,q)+math.dist(q,end))/2.2))
            for n in range(1, count + 1):
                t = n / count
                points.append(tuple((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for a,b,c,d in zip(start,p,q,end)))
    return points


class Sheet:
    def __init__(self):
        self.image = Image.new('RGB', (W*SS, H*SS), PAPER)
        self.draw = ImageDraw.Draw(self.image)
        self.last_stroke = None
        # Extra paper on either side keeps the subject in frame even in a short,
        # ultrawide header. The pen crosses both trim edges at the same height.
        self.pen('M -608 207 C -470 207 -422 200 -337 200 C -218 200 -149 207 -8 207',1.6,GRAPHITE)
        self.pen('M 1208 207 C 1344 207 1378 213 1497 213 C 1620 213 1727 207 1808 207',1.55,GRAPHITE)

    def pen(self, path, size=2.0, ink=INK, fill=None, wet=False):
        points = [(x+LEFT,y) for x,y in path_points(path)]
        if fill:
            self.draw.polygon([(x*SS,y*SS) for x,y in points], fill=fill)
        if wet:
            self.last_stroke = (path,size)
        if not size:
            return
        outer, inner, dist = [], [], 0
        for i,(x,y) in enumerate(points):
            if i: dist += math.dist(points[i-1],points[i])
            a,b = points[max(i-1,0)],points[min(i+1,len(points)-1)]
            dx,dy = b[0]-a[0],b[1]-a[1]
            length = math.hypot(dx,dy) or 1
            nx,ny = -dy/length,dx/length
            # Pressure swells at a turn; long pen strokes have a much finer edge.
            thickness = size*(.89+.16*math.sin(dist/48+.7)+.09*math.cos(dist/13)+.05*math.sin(dist/4.4))
            weave = .13*math.sin(dist/12+.5)+.07*math.sin(dist/4.1)
            r = thickness/2
            outer.append(((x+nx*(weave+r))*SS,(y+ny*(weave+r))*SS))
            inner.append(((x+nx*(weave-r))*SS,(y+ny*(weave-r))*SS))
        self.draw.polygon(outer+inner[::-1], fill=ink)
        for x,y in (points[0],points[-1]):
            r=size*.43
            self.draw.ellipse(((x-r)*SS,(y-r)*SS,(x+r)*SS,(y+r)*SS),fill=ink)


def index(sheet):
    p=sheet.pen
    # Card dividers fan toward the back. The thin lead-in and exit meet their
    # neighbours at the same ordinate when the three covers are placed together.
    p('M -8 207 C 100 207 165 220 243 210 C 323 200 354 174 394 163 C 426 154 449 143 475 137',1.6,GRAPHITE)
    p('M 730 226 C 775 245 801 252 856 243 C 916 232 954 207 1030 204 C 1096 201 1156 207 1208 207',1.5,GRAPHITE)
    p('M 473 138 L 545 85 C 549 81 552 81 557 82 L 604 91 C 610 92 611 94 613 99 L 617 106 L 702 121 C 707 122 709 125 709 129 L 699 219 L 480 232 Z',2.05,GRAPHITE,PAPER_BACK)
    p('M 420 156 L 489 109 C 491 107 496 106 500 107 L 573 120 L 581 109 C 582 107 586 106 591 107 L 634 114 C 639 115 642 118 643 123 L 644 132 L 709 143 C 716 144 717 147 716 153 L 704 241 L 436 242 Z',2.05,GRAPHITE,'#f0eee4')
    p('M 407 176 L 455 137 C 459 134 462 134 467 135 L 602 158 L 612 144 C 615 140 618 139 624 140 L 667 147 C 672 148 674 151 675 156 L 676 169 L 718 176 L 701 259 L 426 251 Z',1.9,INK,PAPER_LIGHT)
    # A folded pocket, with its back edge disappearing behind the index cards.
    p('M 385 163 L 419 149 L 451 154 L 435 171 Z',1.8,INK,PAPER_BACK)
    p('M 385 163 C 383 161 381 163 382 167 L 400 257 C 401 262 405 265 410 266 L 647 309 C 652 310 654 308 656 305 L 688 216 L 670 209 L 604 206 C 592 206 581 201 575 194 L 564 182 C 561 179 557 178 552 178 Z',2.65,INK,'#f1eee4')
    p('M 650 308 L 713 272 C 717 270 719 267 720 262 L 735 180 L 687 204 C 683 206 681 208 679 213 Z',2.3,INK,'#e5e3d8')
    p('M 678 212 C 695 204 715 194 732 185',.95,GRAPHITE)
    p('M 404 258 C 449 266 486 273 524 280 L 644 302',.95,PENCIL)
    # Slip under a narrow label frame; the middle is deliberately blank.
    p('M 462 213 L 527 224 L 529 241 L 464 230 Z',1.5,GRAPHITE,PAPER_LIGHT)
    p('M 472 220 L 485 222',1.1,GRAPHITE)
    p('M 491 223 L 516 227',1.1,GRAPHITE)
    # Pen tip rests on the visible top edge of the current tab.
    p('M 607 153 L 613 145 C 616 141 619 141 624 142 L 666 149 C 671 150 672 154 673 158',3.8,BLUE,wet=True)
    sheet.last_stroke = ('M 467 135 L 602 158 L 613 145 C 616 141 619 141 624 142 L 666 149 C 671 150 672 154 673 158', 3.0)


def leaf(sheet):
    p=sheet.pen
    p('M -8 207 C 92 207 159 222 233 225 C 298 228 339 209 400 204 L 465 195',1.6,GRAPHITE)
    p('M 727 219 C 770 189 803 179 843 186 C 900 196 950 225 1030 216 C 1117 207 1157 207 1208 207',1.55,GRAPHITE)
    # The lower silhouette is open at the spine, with only a few leaf edges.
    p('M 360 223 L 393 205 C 459 190 530 198 586 232 C 648 201 722 181 785 191 L 837 229 C 759 226 680 248 612 289 C 609 292 606 293 602 291 C 528 252 448 232 367 234 Z',2.5,INK,PAPER_BACK)
    p('M 365 223 C 452 218 535 247 599 283 C 604 286 608 286 613 282 C 677 242 757 220 830 223',1.15,GRAPHITE)
    p('M 369 218 C 467 214 536 246 597 277',.9,PENCIL)
    p('M 610 276 C 669 238 739 214 817 216',1.1,GRAPHITE)
    p('M 360 211 C 414 186 514 187 569 210 L 606 268 C 539 227 452 206 360 216 Z',2,INK,PAPER_LIGHT)
    p('M 605 268 C 649 222 690 193 747 174 C 780 177 798 193 828 213 C 742 203 674 229 607 274 Z',1.9,INK,PAPER_LIGHT)
    # Rising leaf: the same stroke makes the ridge on one face and the gutter on the other.
    p('M 604 268 C 576 233 554 210 521 192 C 487 174 458 163 426 161 C 472 143 518 138 570 150 C 623 162 644 199 649 225 C 633 236 619 251 604 268 Z',2.6,INK,'#eeece1')
    p('M 604 268 C 592 241 573 211 554 188 C 537 168 520 150 499 136 C 544 103 591 79 633 75 C 662 113 682 154 680 192 C 653 214 628 240 604 268 Z',2.8,INK,PAPER_LIGHT)
    p('M 604 268 C 620 224 640 190 670 157 C 698 126 722 111 750 101 C 748 133 755 159 774 178 C 713 191 650 227 604 268 Z',2,INK,'#ecebdf')
    p('M 620 245 C 648 196 695 142 737 121',.95,PENCIL)
    p('M 532 139 C 549 127 573 115 591 109',1.25,GRAPHITE)
    p('M 540 149 C 560 136 585 123 601 118',1.2,GRAPHITE)
    p('M 547 159 C 560 151 574 143 585 139',1.15,GRAPHITE)
    # A single narrow blue ribbon held between the open leaves.
    p('M 604 268 C 615 284 638 292 660 296 L 650 300 L 653 307 C 629 300 610 288 604 268 Z',1.2,BLUE,'#607ba8')
    p('M 604 268 C 611 284 631 298 653 307',2.5,BLUE,wet=True)
    sheet.last_stroke = ('M 499 136 C 544 103 591 79 633 75 C 662 113 682 154 680 192 C 653 214 628 240 604 268 C 611 284 631 298 653 307', 2.8)


def margin(sheet):
    p=sheet.pen
    p('M -8 207 C 103 207 153 192 234 191 C 315 189 361 209 405 226 C 427 235 446 240 469 241',1.55,GRAPHITE)
    p('M 746 198 C 769 184 786 187 806 204 C 841 239 875 196 931 192 C 1017 184 1095 207 1208 207',1.55,GRAPHITE)
    # Margin of a manuscript, seen close up; the proof mark bridges the two sides.
    p('M 394 123 C 459 119 507 117 553 111',1.15,PENCIL)
    p('M 400 153 C 447 150 506 146 553 143',2,GRAPHITE)
    p('M 399 163 C 448 160 479 157 512 155',1.2,GRAPHITE)
    p('M 397 193 C 453 190 478 189 512 186',2,GRAPHITE)
    p('M 519 186 L 548 184',2,GRAPHITE)
    p('M 394 225 C 446 222 474 220 495 218',2.1,INK)
    p('M 503 218 L 551 215',2.1,INK)
    p('M 391 257 C 432 254 456 253 477 252',1.8,GRAPHITE)
    p('M 564 94 C 563 132 559 203 557 250 L 555 285',.9,PENCIL)
    # A large pilcrow drawn in ink; the bowl is made with a single folding contour.
    p('M 697 112 C 664 109 633 108 607 118 C 581 128 578 151 589 167 C 599 182 618 186 638 178 L 629 250 C 628 261 625 267 614 268 L 613 272 L 648 269 L 649 266 C 639 266 637 262 638 253 L 652 120 L 673 118 L 659 248 C 658 260 655 265 647 266 L 646 270 L 680 267 L 681 263 C 670 265 668 261 669 251 L 684 118 L 696 117 Z',2.45,INK,'#40423e')
    # A little counterlight where the second pen path turns into the bowl.
    p('M 600 135 C 607 125 620 122 633 123',.9,'#a5a699')
    # The insertion begins under the passage and rises to a handwritten correction.
    p('M 475 238 C 486 241 503 241 512 238 L 520 223 L 527 239 C 554 239 571 243 583 253 C 594 262 590 279 578 280 C 566 281 563 272 570 262 C 587 242 632 232 686 223 C 701 221 716 216 725 210',2.45,BLUE,wet=True)
    # Five-stroke editorial asterisk by the working end of the pen.
    p('M 737 192 C 736 198 734 207 733 218',2.4,BLUE)
    p('M 723 198 L 745 211',2.3,BLUE)
    p('M 721 211 L 746 198',2.35,BLUE)


ART = [('ink-index',index),('ink-leaf',leaf),('ink-margin',margin)]


def finish(image, seed):
    image = image.resize((3456,576),Image.Resampling.LANCZOS)
    # The slight paper tooth is baked in, so reading and export need no shader.
    rng = random.Random(seed)
    def field(size):
        return Image.frombytes('L', size, rng.randbytes(size[0]*size[1]))
    broad = field((9,4)).resize(image.size,Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(25))
    fine = field(image.size)
    image = ImageChops.add(image,ImageOps.colorize(broad,'#000000','#060605'),offset=-3)
    return ImageChops.add(image,ImageOps.colorize(fine,'#000000','#070706'),offset=-3)


def save_wet_pass(path, stroke):
    d,width = stroke
    # A single pass dries onto the plate beneath. Both images use the same
    # viewbox so the nib remains registered through object-fit and repositioning.
    path.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-600 0 2400 400">\n'
        f'  <path id="nib" pathLength="1" fill="none" stroke-linejoin="round" '
        f'stroke-linecap="round" stroke-width="{width+0.9:.2f}" d="{d}"/>\n</svg>\n'
    )


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    out=parser.parse_args().output
    out.mkdir(parents=True,exist_ok=True)
    for i,(name,draw) in enumerate(ART):
        sheet=Sheet()
        draw(sheet)
        finished=finish(sheet.image, 18+i)
        finished.save(out / (name+'.webp'), quality=87, method=6)
        ImageOps.fit(finished,(480,160),method=Image.Resampling.LANCZOS).save(out / (name+'-thumb.webp'),quality=91,method=6)
        save_wet_pass(out / (name+'-ink.svg'),sheet.last_stroke)
