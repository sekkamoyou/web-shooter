# PBR textures and environment lighting

All assets below: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), from Poly Haven (https://polyhaven.com/license), downloaded 2026-09-07. Original PBR/HDR file MD5 values verified during download; background JPG SHA-256 recorded below. Textures use original 1K JPGs, renamed to `color.jpg` (Diffuse), `normal.jpg` (OpenGL normal), `arm.jpg` (AO/Roughness/Metalness). Lighting uses the original 1K HDR; the visible background uses the original 8K tonemapped JPG. No image editing or generated imagery; only runtime UV scale, material tint, normal intensity and lighting adjustments.

| Local path | Asset / creators | Source |
| --- | --- | --- |
| `concrete_floor_02/` | Concrete Floor 02 / Rob Tuytel | https://polyhaven.com/a/concrete_floor_02 |
| `concrete_wall_004/` | Concrete Wall 004 / Charlotte Baglioni, Dario Barresi | https://polyhaven.com/a/concrete_wall_004 |
| `corrugated_iron/` | Corrugated Iron / Dimitrios Savva, Jenelle van Heerden | https://polyhaven.com/a/corrugated_iron |
| `industrial_sunset_02.hdr`, `industrial_sunset_02-background.jpg` | Industrial Sunset 02 / Sergej Majboroda | https://polyhaven.com/a/industrial_sunset_02 |

Metadata and original file links: `https://api.polyhaven.com/files/{asset_id}`. Runtime uses locally hosted files; external asset hosts are not contacted by players.


Background JPG downloaded 2026-09-07 from Poly Haven's official **8K Tonemapped JPG** download (not a thumbnail): https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/industrial_sunset_02.jpg . Original 8192×4096 pixels; file unmodified.

SHA-256: `740ed955268f062e42b4ebb829564322152cfad055540cdf8c0c23c3b85e0f23`.

Runtime background conversion: sRGB JPG → cubemap capped at 2048×2048 per face and the GPU's supported limit; no background blur. The 1K HDR remains the independent source of world and weapon reflections/lighting. No image-generation tools or new dependencies were used.
