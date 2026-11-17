# Pavement Atlas · release detector

| Property | Release value |
|---|---|
| Public checkpoint | Vivek Vagale, Road Hazard Detection, YOLO11n trained on RDD2022 India |
| Model input | One 640 × 640 RGB float32 NCHW tensor, values scaled to 0–1 |
| Padding | Preserve aspect ratio, RGB 114 border, centred letterbox |
| Export | ONNX, fixed input, opset 17, raw detection head |
| Class order | 0 D00 longitudinal, 1 D10 transverse, 2 D20 alligator, 3 D40 pothole |
| Browser runtime | ONNX Runtime Web 1.20.1, single-threaded WASM in a module Worker |
| Weights | 10,607,022 bytes, SHA-256 a93a8e1735aaf6cd502d13be54684b6335eb8cca1eec270d053e43550531e1f9 |
| Decoding | Highest-scoring class per anchor, class-wise NMS at IoU 0.45, at most 300 proposals |
| App cutoff | 0.25 by default. The worker retains candidates down to 0.05 for interactive filtering |
| Study cutoff | Scores down to 0.001 for AP. Match threshold IoU ≥ 0.50. Reported operating counts at confidence ≥ 0.25 |

The freeze includes the public ONNX weights and their corresponding upstream training/export scripts. Original source commit 84673b89d7def3dcb2211ef00a10e3eb0318d0dd. Deployment commit 51d35397be11a3bf0ff9c11270540a424f418647. [Upstream project](https://github.com/VivekVagale/road-hazard/tree/84673b89d7def3dcb2211ef00a10e3eb0318d0dd) · [Public checkpoint](https://github.com/VivekVagale/road-hazard/blob/51d35397be11a3bf0ff9c11270540a424f418647/models/yolo11n.onnx).

The ONNX file's embedded metadata declares AGPL-3.0. The upstream research scripts carry their original MIT notice. ONNX Runtime Web ships with Microsoft's MIT licence and its third-party notices. The original Pavement Atlas application code is distributed under AGPL-3.0. The gallery imagery and converted annotations carry their own [data attribution](../data/ATTRIBUTION.md). The public checkpoint and evaluation are distinct from Katumala Sarala's five reported experiments.

## Evaluation and appropriate use

On the reconstructed block-test partition of 775 labelled images the shipped checkpoint reached 0.402 mAP50. At 0.25, 310 reference boxes were matched, 172 predictions were unmatched and 426 reference boxes were missed. Of eight transverse-crack references, zero were detected at that cutoff. Absence of an annotation or a prediction cannot establish a road's condition. The tool records visible surface distress. Physical depth, structural capacity, surveyed length and repair urgency require additional field observations.

The fresh figures use the included evaluator's preprocessing, NMS and 101-point interpolation. The upstream project also reports results under its own evaluation pipeline. Compare like-for-like settings and splits when reporting performance. The app displays forward-pass and decode time. Download, image decode, model initialization and database writes are outside that timer. Browser resampling and JPEG decoding can shift boxes near decision boundaries.

Training scripts, per-image references, predictions and the evaluation code accompany the release. [Ultralytics source](https://github.com/ultralytics/ultralytics) · [ONNX Runtime v1.20.1 source](https://github.com/microsoft/onnxruntime/tree/v1.20.1).
