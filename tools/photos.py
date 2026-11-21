"""장소 사진에서 GPS 좌표를 읽어 places.js에 채우고, 위치 정보를 지운 사진을 images/에 만든다.

사용법 (레포 루트에서):
    python tools/photos.py

1. 폰에서 USB로 옮긴 원본 사진을 images/originals/에 넣는다. (이 폴더는 커밋하지 않는다)
2. places.js에서 장소의 photo를 "images/<원본 파일 이름>"으로 적는다.
   예: 원본이 images/originals/20261121_193253.jpg면 photo: "images/20261121_193253.jpg"
3. 이 스크립트를 실행하면
   - 원본 EXIF의 위도·경도로 그 장소의 lat, lng를 바꾸고
   - EXIF를 모두 지우고 크기를 줄인 사진을 images/<같은 이름>.jpg로 저장한다.

필요한 패키지: Pillow (pip install pillow)
"""

import math
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ORIGINALS = ROOT / "images" / "originals"
OUTPUT = ROOT / "images"
PLACES_JS = ROOT / "places.js"

MAX_SIDE = 1600  # 카드에 보여주기에 충분한 크기
JPEG_QUALITY = 85
GPS_IFD = 0x8825


def read_gps(img):
    """EXIF에서 (위도, 경도)를 읽는다. 없거나 비어 있으면 None."""
    gps = img.getexif().get_ifd(GPS_IFD)
    try:
        lat_ref, lat, lng_ref, lng = gps[1], gps[2], gps[3], gps[4]
        lat_v = float(lat[0]) + float(lat[1]) / 60 + float(lat[2]) / 3600
        lng_v = float(lng[0]) + float(lng[1]) / 60 + float(lng[2]) / 3600
    except (KeyError, IndexError, ZeroDivisionError, TypeError):
        return None
    # 안드로이드가 앱을 거친 사진의 위치를 지우면 0이나 NaN만 남는다.
    if math.isnan(lat_v) or math.isnan(lng_v) or (lat_v == 0 and lng_v == 0):
        return None
    if lat_ref == "S":
        lat_v = -lat_v
    if lng_ref == "W":
        lng_v = -lng_v
    return round(lat_v, 6), round(lng_v, 6)


def save_stripped(img, dest):
    """회전 정보를 픽셀에 반영하고, 크기를 줄여 EXIF 없이 저장한다."""
    img = ImageOps.exif_transpose(img)
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    img.convert("RGB").save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)


def set_place_coords(js, photo_path, lat, lng):
    """photo가 photo_path인 장소 블록의 lat, lng를 바꾼다. 못 찾으면 None."""
    pattern = re.compile(r"\{[^{}]*?photo:\s*\"" + re.escape(photo_path) + r"\"[^{}]*?\}")
    m = pattern.search(js)
    if not m:
        return None
    block = m.group(0)
    block = re.sub(r"lat:\s*-?[\d.]+", f"lat: {lat}", block, count=1)
    block = re.sub(r"lng:\s*-?[\d.]+", f"lng: {lng}", block, count=1)
    return js[: m.start()] + block + js[m.end():]


def main():
    if not ORIGINALS.is_dir():
        sys.exit(f"원본 폴더가 없습니다: {ORIGINALS}")

    js = PLACES_JS.read_text(encoding="utf-8")
    problems = 0

    for src in sorted(ORIGINALS.iterdir()):
        if src.suffix.lower() not in (".jpg", ".jpeg"):
            continue
        dest = OUTPUT / (src.stem + ".jpg")
        photo_path = f"images/{dest.name}"

        with Image.open(src) as img:
            coords = read_gps(img)
            save_stripped(img, dest)

        if coords is None:
            print(f"[위치 없음] {src.name}: 사진은 만들었지만 좌표를 못 읽었습니다. "
                  "폰에서 USB로 원본을 다시 옮겨 보세요.")
            problems += 1
            continue

        updated = set_place_coords(js, photo_path, *coords)
        if updated is None:
            print(f"[장소 없음] {src.name}: {coords[0]}, {coords[1]} "
                  f"(places.js에 photo: \"{photo_path}\"인 장소가 없습니다)")
            problems += 1
            continue

        js = updated
        print(f"[완료] {src.name}: {coords[0]}, {coords[1]} → {photo_path}")

    PLACES_JS.write_text(js, encoding="utf-8")
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
