function buildCostWidget(base,novC,eliC,opnC,qdC,skC=0,relayC=0,ttC=0,maxC=0) {
  const html=[
    '<div class="card" style="background:var(--panel);margin-top:8px">',
    '<div style="display:flex;justify-content:space-between;align-items:center">',
    '<div style="font-weight:750">Registration Total Preview</div>',
    '<div style="font-size:26px;font-weight:800;color:#EA580C" id="ssm-cost">$'+base+'</div>',
    '</div>',
    '<div style="font-size:12px;color:#64748b;margin-top:4px" id="ssm-breakdown">Base entry fee</div>',
    '</div>',
    '<script>(function(){',
    'var B='+base+',M='+maxC+',C={novice:'+novC+',elite:'+eliC+',open:'+opnC+',quad:'+qdC+',skateability:'+skC+',timeTrials:'+ttC+',relays:'+relayC+',challengeUp:0};',
    'function money(n){return "$"+Number(n||0).toFixed(0);}',
    'function checked(k){var el=document.querySelector("[name="+k+"]");return !!(el&&((el.type==="checkbox"&&el.checked)||el.value==="on"));}',
    'function upd(){var sel=[];',
    '["novice","elite","open","quad","skateability","timeTrials","relays"].forEach(function(k){if(checked(k))sel.push({name:k,cost:C[k]||0});});',
    'var total=B,lines=["Base entry fee: "+money(B)];',
    'sel.forEach(function(item){total+=Number(item.cost||0);lines.push("+ "+item.name+": "+money(item.cost));});',
    'if(M>0&&total>M){lines.push("Max registration cap applied: "+money(M));total=M;}',
    'var t=document.getElementById("ssm-cost"),b=document.getElementById("ssm-breakdown");',
    'if(t)t.textContent=money(total);if(b)b.textContent=lines.join(" | ");',
    '}document.addEventListener("change",upd);document.addEventListener("input",upd);setTimeout(upd,100);',
    '})();</script>'
  ];
  return html.join("");
}

module.exports = {
  buildCostWidget,
};
