# RDD2022 example photographs and annotations

The gallery contains 16 original India road photographs from the public labelled training portion of RDD2022. Each JPEG retains its original dataset identifier. The 720 × 720 pixel files are unchanged. The reference boxes in the manifest were converted from PASCAL VOC pixel corners to normalized top-left coordinates and dimensions. Each manifest entry includes the JPEG's SHA-256 and the number of annotations excluded from the four challenge classes, grouped by original code. Reference boxes belong to the dataset creators. Inference boxes are generated separately by the app.

**Citation.** Deeksha Arya, Hiroya Maeda, Yoshihide Sekimoto, Hiroshi Omata, Sanjay Kumar Ghosh, Durga Toshniwal, et al. (2022). *RDD2022 – The multi-national Road Damage Dataset released through CRDDC’2022*. figshare, version 1. [Dataset and complete contributor list](https://doi.org/10.6084/m9.figshare.21431547.v1).

**Reuse.** The official Figshare record identifies [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) for this release. Keep the attribution with redistributed examples and indicate modifications. The photographs and reference annotations were obtained from the official archive. [Release metadata](https://api.figshare.com/v2/articles/21431547/versions/1).

## How the examples were selected

The public YOLO11n detector developer used 25-frame blocks of lexically sorted India image identifiers. With a fixed pseudorandom seed of 42, their code assigned 80% of blocks to training, 10% to validation and the remaining blocks to testing. Reconstructing this split from 7,706 paired JPEG/XML entries gives 6,156 training, 775 validation and 775 test frames. These are developer-defined splits of released labelled data. Route IDs are unavailable in this workflow. Adjacent blocks and visually similar frames can still cross split boundaries. The original competition test photographs have no public reference boxes. [Model developer's split implementation](https://github.com/VivekVagale/road-hazard/blob/84673b89d7def3dcb2211ef00a10e3eb0318d0dd/src/prepare.py) · [Challenge documentation](https://crddc2022.sekilab.global/data/).

The 16 gallery images are a curated selection from the 775 block-test frames. Two mixed-distress examples appear first. The program then selects three legible examples for each target type and two frames with no source objects. This selection favors visible target shapes and is unsuitable for calculating accuracy or road prevalence. The study's fifth reported class, “other corruption”, needs Sarala’s actual class mapping before it can be reconciled to individual VOC codes.

The released photographs include streets outside the Ongole campus. No precise location, road segment, or real field-inspection result is attributed to an example.

## Rebuild from the original release

Run from the top level of the downloaded project with Python 3.10 or newer.

```sh
python scripts/download_india.py India.zip
python scripts/prepare_rdd2022_india.py India.zip --evaluation evaluation/india-block-test
```

The downloader retrieves the 502 MiB India member of the [official 13.26 GB archive](https://figshare.com/ndownloader/files/38030910). It verifies the release member's length (526,709,145 bytes) and CRC32 before installing it. As an alternative, download the full ZIP from Figshare and extract its `RDD2022/India.zip` member. The preparation script reads the inner ZIP directly. The optional `--evaluation` argument writes the complete independent evaluation input and manifest locally, outside the hosted `docs` folder. Keep generated archives and the full evaluation directory off GitHub unless needed.
