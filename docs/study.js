export const runs = [
  ['YOLOv8n','India only','India',0.364,0.336],
  ['YOLOv8s','India + transverse-crack images','India',0.386,0.346],
  ['YOLOv8s','India + 3,000 international images','India',0.413,null],
  ['YOLO11m','All countries','All countries',0.455,null],
  ['YOLO11m','Fine-tuned on India','India',0.352,0.329]
];
export function renderStudy(container) {
  const bars = runs.filter(r=>r[2]==='India').map(r=>`<div class="bargroup"><span><strong>${r[0]}</strong><br>${r[1]}</span><div class="track"><i style="width:${r[3]*100}%"></i></div><em>${r[3].toFixed(3)}</em></div>`).join('');
  const table = runs.map(r=>`<tr><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3].toFixed(3)}</td><td>${r[4]?.toFixed(3) ?? '—'}</td></tr>`).join('');
  container.innerHTML=`<div class="studygrid"><article class="panel pad"><div class="eyebrow"><b></b> INDIA VALIDATION / mAP50</div><h2>Model comparison</h2>${bars}<p class="help">Bar scale 0–1. Each value is the mean class average precision at a box overlap threshold of 0.50. The international validation run has a different evaluation population.</p></article><article class="panel pad textcontent"><div class="eyebrow"><b></b> STUDENT-REPORTED RUN</div><h2>India + 3,000 images</h2><span class="chip">YOLOv8s</span><div class="readout"><div><strong>.611</strong><div class="tiny">PRECISION</div></div><div><strong>.399</strong><div class="tiny">RECALL</div></div></div><p>Training ended after 73 epochs with early stopping. Epoch 48 produced the best checkpoint. A test score for this run was not supplied.</p></article></div><article class="panel pad strip"><div class="eyebrow"><b></b> EXPERIMENT REGISTER</div><h2>All reported results</h2><div class="tablewrap"><table><thead><tr><th>Model</th><th>Training data / adaptation</th><th>Validation domain</th><th>Val mAP50</th><th>India test mAP50</th></tr></thead><tbody>${table}</tbody></table></div><p class="help">— = unreported. The all-country run reached 42 epochs in 12 hours before the platform time limit. These values come from the student's project update of 14 November 2026.</p></article><div class="detailsgrid"><article class="panel pad textcontent"><div class="eyebrow"><b></b> DATASET</div><h2>India split</h2><p>The student reports 5,368 training images, 1,172 validation images and 1,166 test images in the Kaggle split. “Other corruption” is her fifth label. Official RDD2022 challenge evaluation covers D00, D10, D20 and D40.</p><p>The study's strongest reported class is alligator cracking (about 0.6). India has few transverse-crack examples. Exact class-wise results and the student's label map were unavailable.</p><a class="source" href="https://doi.org/10.6084/m9.figshare.21431547" target="_blank" rel="noreferrer">Official RDD2022 dataset ↗</a> · <a class="source" href="https://www.kaggle.com/datasets/aliabdelmenam/rdd-2022" target="_blank" rel="noreferrer">Kaggle split ↗</a></article><article class="panel pad textcontent"><div class="eyebrow"><b></b> DEPLOYED DETECTOR</div><h2>Release checkpoint</h2><p>This release includes a separate public four-class YOLO11n road-damage model. The scores above describe Sarala's experiments. Run the detector on a reference frame to inspect its actual output.</p><p>Candidate boxes identify visible defects. A reviewer can correct the class, draw a missed defect or mark a false alarm. The register retains the source of each box.</p><a class="source" href="./model/MODEL_CARD.md">Read checkpoint details ↗</a></article></div>`;
}

export async function prependEvaluation(container){
  const res=await fetch('./data/evaluation.json');if(!res.ok)return;
  const result=await res.json();
  const fmt=n=>n.toFixed(3);
  const rows=Object.entries(result.per_class).map(([code,c])=>`<tr><td><strong>${code}</strong></td><td>${c.ground_truth}</td><td><div class="metricbars"><span>${fmt(c.ap50_101)}</span><i style="width:${Math.round(c.ap50_101*80)}px"></i></div></td><td>${c.tp}</td><td>${c.fp}</td><td>${c.fn}</td></tr>`).join('');
  const panel=document.createElement('article');panel.className='panel pad studydata';
  panel.innerHTML=`<div class="eyebrow"><b></b> MEASURED / PUBLIC CHECKPOINT</div><h2>How the bundled detector performed</h2><p class="info">YOLO11n on ${result.images} India test images grouped by filename blocks. This split is distinct from the student's India test split.</p>
  <div class="summarygrid modelresult"><div class="stat"><strong>${fmt(result.mAP50_101)}</strong><span class="tiny">mAP50</span></div><div class="stat"><strong>${fmt(result.micro_precision)}</strong><span class="tiny">MICRO PRECISION</span></div><div class="stat"><strong>${fmt(result.micro_recall)}</strong><span class="tiny">MICRO RECALL</span></div></div>
  <div class="tablewrap"><table><thead><tr><th>Class</th><th>Reference boxes</th><th>AP50</th><th>Matched</th><th>False alarms</th><th>Missed</th></tr></thead><tbody>${rows}</tbody></table></div><p class="help">Counts use confidence ≥ 0.25 and matching IoU ≥ 0.50. AP integrates predictions down to 0.001. All eight transverse cracks were missed at the displayed operating point. Only eight examples support that row.</p>
  <a class="source" href="./data/evaluation.json" download>Download measured results ↧</a></article>`;
  if(result.operating_points?.length){
    const sweep=document.createElement('div');sweep.className='sweep';
    sweep.innerHTML='<label>Explore the confidence cutoff<select aria-label="Study confidence cutoff"></select></label><p aria-live="polite"></p>';
    const select=sweep.querySelector('select');
    result.operating_points.forEach(o=>select.add(new Option(o.threshold.toFixed(2),String(o.threshold))));
    select.value=String(result.operating_cutoff);
    const update=()=>{const o=result.operating_points.find(x=>x.threshold===Number(select.value));
      sweep.querySelector('p').textContent=(o.tp+o.fp)+' boxes to review · '+o.tp+' matches · '+o.fp+' false alarms · '+o.fn+' missed reference boxes. Precision '+fmt(o.micro_precision)+', recall '+fmt(o.micro_recall)+'.';
    };
    select.onchange=update;update();panel.querySelector('.tablewrap').after(sweep);
  }
  container.prepend(panel);
}
