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

    '<script>',
    '(function(){',
    '  var B=' + JSON.stringify(safeBase) + ';',
    '  var A=' + JSON.stringify(safeAdditional) + ';',
    '  var M=' + JSON.stringify(safeMax) + ';',
    '  var CATEGORY_NAMES=["novice","elite","open","quad","timeTrials","additional","relay2Person","relay3Person","relay4Person"];',

    '  function money(n){',
    '    return "$"+Number(n||0).toFixed(0);',
    '  }',

    '  function checked(name){',
    '    var els=document.querySelectorAll("[name="+JSON.stringify(name)+"]");',
    '    for(var i=0;i<els.length;i++){',
    '      var el=els[i];',
    '      var type=String(el.type||"").toLowerCase();',
    '      if((type==="checkbox"||type==="radio")&&el.checked) return true;',
    '      if(type!=="checkbox"&&type!=="radio"){',
    '        var value=String(el.value||"").trim();',
    '        if(value!==""&&value!=="off"&&value!=="false"&&value!=="0") return true;',
    '      }',
    '    }',
    '    return false;',
    '  }',

    '  function selectedSpecialRaceCount(){',
    '    var els=document.querySelectorAll("input[name=\'specialRaceIds\']:checked");',
    '    return els ? els.length : 0;',
    '  }',

    '  function selectedCount(){',
    '    var names=[];',
    '    for(var i=0;i<CATEGORY_NAMES.length;i++){',
    '      if(checked(CATEGORY_NAMES[i])) names.push(CATEGORY_NAMES[i]);',
    '    }',
    '    var specials=selectedSpecialRaceCount();',
    '    for(var s=0;s<specials;s++) names.push("specialRace");',
    '    return names.length;',
    '  }',

    '  function updateCost(){',
    '    var selected=selectedCount();',
    '    var extra=Math.max(0,selected-1);',
    '    var total=selected>0 ? B+(extra*A) : B;',
    '    var lines=["Base registration: "+money(B)+" (first event included)"];',
    '    if(selected>1) lines.push(extra+" additional event"+(extra===1?"":"s")+" × "+money(A));',
    '    if(selected===0) lines.push("No event categories selected yet");',
    '    if(M>0&&total>M){',
    '      lines.push("Max registration cap applied: "+money(M));',
    '      total=M;',
    '    }',
    '    var totalEl=document.getElementById("ssm-cost");',
    '    var breakdownEl=document.getElementById("ssm-breakdown");',
    '    if(totalEl) totalEl.textContent=money(total);',
    '    if(breakdownEl) breakdownEl.textContent=lines.join(" | ");',
    '  }',

    '  document.addEventListener("change",updateCost,true);',
    '  document.addEventListener("input",updateCost,true);',
    '  document.addEventListener("click",function(){setTimeout(updateCost,0);},true);',
    '  if(document.readyState==="loading"){',
    '    document.addEventListener("DOMContentLoaded",updateCost);',
    '  } else {',
    '    updateCost();',
    '  }',
    '  setTimeout(updateCost,50);',
    '  setTimeout(updateCost,250);',
    '})();',
    '</script>',
  ];

  return html.join('');
}

module.exports = {
  buildCostWidget,
};
