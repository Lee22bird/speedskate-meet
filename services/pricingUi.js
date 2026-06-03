function buildCostWidget(base, additionalFee, maxCap = 0) {
  const safeBase = Number(base || 0);
  const safeAdditional = Number(additionalFee || 0);
  const safeMax = Number(maxCap || 0);

  const html = [
    '<div class="card" style="background:var(--panel);margin-top:8px">',
    '<div style="display:flex;justify-content:space-between;align-items:center">',
    '<div style="font-weight:750">Registration Total Preview</div>',
    '<div style="font-size:26px;font-weight:800;color:#EA580C" id="ssm-cost">$' + safeBase.toFixed(0) + '</div>',
    '</div>',
    '<div style="font-size:12px;color:#64748b;margin-top:4px" id="ssm-breakdown">Base registration includes the first selected event category.</div>',
    '</div>',
    '<script>(function(){',
    'var B=' + safeBase + ',A=' + safeAdditional + ',M=' + safeMax + ';',
    'function money(n){return "$"+Number(n||0).toFixed(0);}',

    // IMPORTANT:
    // The old version counted any checkbox with value="on" as selected, even when unchecked.
    // Toggle checkboxes all use value="on", so unchecked events were being counted.
    'function checked(k){',
    '  var els=document.querySelectorAll("[name=\\"" + k + "\\"]");',
    '  for(var i=0;i<els.length;i++){',
    '    var el=els[i];',
    '    if((el.type==="checkbox"||el.type==="radio")&&el.checked)return true;',
    '    if(el.type!=="checkbox"&&el.type!=="radio"&&String(el.value||"").trim()!==""&&String(el.value||"").trim()!=="off")return true;',
    '  }',
    '  return false;',
    '}',

    'function upd(){',
    'var names=[];',
    '[',
    '  "novice",',
    '  "elite",',
    '  "open",',
    '  "quad",',
    '  "timeTrials",',
    '  "additional",',
    '  "relay2Person",',
    '  "relay3Person",',
    '  "relay4Person"',
    '].forEach(function(k){if(checked(k))names.push(k);});',

    'document.querySelectorAll("input[name=\"specialRaceIds\"]:checked").forEach(function(){names.push("specialRace");});',

    'var selected=names.length;',
    'var extra=Math.max(0,selected-1);',
    'var total=selected>0 ? B+(extra*A) : B;',
    'var lines=["Base registration: "+money(B)+" (first event included)"];',
    'if(selected>1)lines.push(extra+" additional event"+(extra===1?"":"s")+" × "+money(A));',
    'if(selected===0)lines.push("No event categories selected yet");',
    'if(M>0&&total>M){lines.push("Max registration cap applied: "+money(M));total=M;}',
    'var t=document.getElementById("ssm-cost"),b=document.getElementById("ssm-breakdown");',
    'if(t)t.textContent=money(total);if(b)b.textContent=lines.join(" | ");',
    '}',
    'document.addEventListener("change",upd);document.addEventListener("input",upd);setTimeout(upd,100);',
    '})();</script>'
  ];
  return html.join("");
}

module.exports = {
  buildCostWidget,
};
