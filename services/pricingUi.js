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
    '  var CATEGORY_NAMES=["novice","elite","open","quad","timeTrials","additional","relay2Person","relay3Person","relay4Person","quadRelay2Person","quadRelay3Person"];',

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

    '  function selectedInputCount(name){',
    '    var els=document.querySelectorAll("input[name="+JSON.stringify(name)+"]:checked");',
    '    var seen={};',
    '    var count=0;',
    '    for(var i=0;i<els.length;i++){',
    '      var value=String(els[i].value||"").trim();',
    '      if(value&&!seen[value]){ seen[value]=true; count++; }',
    '    }',
    '    return count;',
    '  }',

    '  function selectedCount(){',
    '    var names=[];',
    '    var relayEvents=selectedInputCount("relayEventIds");',
    '    var quadRelayEvents=selectedInputCount("quadRelayEventIds");',
    '    for(var i=0;i<CATEGORY_NAMES.length;i++){',
    '      var name=CATEGORY_NAMES[i];',
    '      if(relayEvents>0&&(name==="relay2Person"||name==="relay3Person"||name==="relay4Person")) continue;',
    '      if(quadRelayEvents>0&&(name==="quadRelay2Person"||name==="quadRelay3Person")) continue;',
    '      if(checked(name)) names.push(name);',
    '    }',
    '    var specials=selectedSpecialRaceCount();',
    '    for(var s=0;s<specials;s++) names.push("specialRace");',
    '    for(var r=0;r<relayEvents;r++) names.push("relayEvent");',
    '    for(var q=0;q<quadRelayEvents;q++) names.push("quadRelayEvent");',
    '    return names.length;',
    '  }',

    '  function updateCost(){',
    '    var selected=selectedCount();',
    '    var extra=Math.max(0,selected-1);',
    '    var total=selected>0 ? B+(extra*A) : B;',
    '    var lines=[selected+" event categor"+(selected===1?"y":"ies")+" selected", money(B)+" base + "+extra+" × "+money(A)+" additional = "+money(total)];',
    '    if(selected===0) lines.push("No event categories selected yet");',
    '    if(M>0&&total>M){',
    '      lines.push("Maximum cap applied: "+money(M)+" (uncapped total was "+money(total)+")");',
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
