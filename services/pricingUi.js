function buildCostWidget(base, additionalC = 0, relay2C = 0, relay3C = 0, relay4C = 0, maxC = 0) {
  const html=[
    '<div class="card" style="background:var(--panel);margin-top:8px">',
    '<div style="display:flex;justify-content:space-between;align-items:center">',
    '<div style="font-weight:750">Registration Total Preview</div>',
    '<div style="font-size:26px;font-weight:800;color:#EA580C" id="ssm-cost">$'+base+'</div>',
    '</div>',
    '<div style="font-size:12px;color:#64748b;margin-top:4px" id="ssm-breakdown">Base registration</div>',
    '</div>',
    '<script>(function(){',
    'var B='+base+',M='+maxC+',C={skateability:'+additionalC+',relay2Person:'+relay2C+',relay3Person:'+relay3C+',relay4Person:'+relay4C+'};',
    'var L={skateability:"Additional race",relay2Person:"2 Person relay",relay3Person:"3 Person relay",relay4Person:"4 Person relay"};',
    'function money(n){return "$"+Number(n||0).toFixed(0);}',
    'function checked(k){var el=document.querySelector("[name="+k+"]");return !!(el&&((el.type==="checkbox"&&el.checked)||el.value==="on"));}',
    'function upd(){var total=B,lines=["Base registration: "+money(B)];',
    '["skateability","relay2Person","relay3Person","relay4Person"].forEach(function(k){if(checked(k)){total+=Number(C[k]||0);lines.push("+ "+L[k]+": "+money(C[k]));}});',
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
