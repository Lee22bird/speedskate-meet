// migrate.js — run once to move ssm_db.json into Supabase
// Usage: node migrate.js
// Requires SUPABASE_URL and SUPABASE_ANON_KEY in environment or .env

require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jdgnhleuvaoywkgdpguc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_ANON_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DATA_FILE = process.env.SSM_DATA_FILE || '/data/ssm_db.json';

async function migrate() {
  console.log('📂 Loading', DATA_FILE);
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const db = JSON.parse(raw);

  // ── USERS ──────────────────────────────────────────────────────────────────
  console.log('\n👤 Migrating users...');
  for (const u of db.users || []) {
    const { error } = await supabase.from('users').upsert({
      id: u.id,
      created_at: u.createdAt,
      username: u.username,
      password_hash: u.passwordHash,
      role: u.role,
      email: u.email || '',
      name: u.name || ''
    }, { onConflict: 'id' });
    if (error) console.error('  user error:', u.username, error.message);
    else console.log('  ✅ user:', u.username);
  }

  // ── RINKS ──────────────────────────────────────────────────────────────────
  console.log('\n🏟️  Migrating rinks...');
  for (const r of db.rinks || []) {
    const { error } = await supabase.from('rinks').upsert({
      id: r.id,
      created_at: r.createdAt,
      name: r.name,
      city: r.city || '',
      state: r.state || '',
      track_length: r.trackLength || '',
      lanes: r.lanes || 4
    }, { onConflict: 'id' });
    if (error) console.error('  rink error:', r.name, error.message);
    else console.log('  ✅ rink:', r.name);
  }

  // ── MEETS ──────────────────────────────────────────────────────────────────
  console.log('\n🏁 Migrating meets...');
  for (const m of db.meets || []) {
    const { error } = await supabase.from('meets').upsert({
      id: m.id,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
      created_by_user_id: m.createdByUserId || null,
      meet_name: m.meetName,
      date: m.date || null,
      end_date: m.endDate || null,
      start_time: m.startTime || '',
      rink_id: m.rinkId || null,
      track_length: m.trackLength || '',
      lanes: m.lanes || 4,
      status: m.status || 'draft',
      is_public: !!m.isPublic,
      base_entry_fee: m.baseEntryFee || 0,
      additional_entry_fee: m.additionalEntryFee || 0,
      entry_cap: m.entryCap || null,
      registration_close_at: m.registrationCloseAt || null,
      notes: m.notes || '',
      relay_notes: m.relayNotes || '',
      relay_enabled: !!m.relayEnabled,
      tiebreaker: m.tiebreaker || '',
      current_race_id: m.currentRaceId || '',
      current_race_index: m.currentRaceIndex || 0,
      race_day_paused: !!m.raceDayPaused
    }, { onConflict: 'id' });
    if (error) { console.error('  meet error:', m.meetName, error.message); continue; }
    console.log('  ✅ meet:', m.meetName);

    // ── REGISTRATIONS ────────────────────────────────────────────────────────
    console.log('  📋 Migrating registrations...');
    for (const reg of m.registrations || []) {
      const { error: rerr } = await supabase.from('registrations').upsert({
        id: String(reg.id),
        created_at: reg.createdAt,
        meet_id: m.id,
        name: reg.name,
        age: reg.age || null,
        gender: reg.gender || '',
        team: reg.team || '',
        sponsor: reg.sponsor || '',
        email: reg.email || '',
        birthdate: reg.birthdate || null,
        helmet_number: String(reg.helmetNumber || ''),
        division_group_id: reg.divisionGroupId || '',
        division_group_label: reg.divisionGroupLabel || '',
        original_division_group_id: reg.originalDivisionGroupId || '',
        challenge_up_group_id: reg.challengeUpGroupId || '',
        challenge_up_group_label: reg.challengeUpGroupLabel || '',
        meet_number: reg.meetNumber || null,
        paid: !!reg.paid,
        checked_in: !!reg.checkedIn,
        total_cost: reg.totalCost || 0,
        opt_elite: !!reg.options?.elite,
        opt_novice: !!reg.options?.novice,
        opt_open: !!reg.options?.open,
        opt_quad: !!reg.options?.quad,
        opt_relays: !!reg.options?.relays,
        opt_challenge_up: !!reg.options?.challengeUp,
        opt_skateability: !!reg.options?.skateability
      }, { onConflict: 'id' });
      if (rerr) console.error('    reg error:', reg.name, rerr.message);
    }
    console.log(`  ✅ ${m.registrations?.length || 0} registrations`);

    // ── RACES ────────────────────────────────────────────────────────────────
    console.log('  🏃 Migrating races...');
    let raceCount = 0;
    for (const race of m.races || []) {
      const { error: raerr } = await supabase.from('races').upsert({
        id: race.id,
        created_at: race.createdAt || new Date().toISOString(),
        meet_id: m.id,
        group_id: race.groupId || '',
        group_label: race.groupLabel || '',
        division: race.division || '',
        distance_label: race.distanceLabel || '',
        ages: race.ages || '',
        gender: race.gender || '',
        race_type: race.isQuadRace ? 'quad' : race.isOpenRace ? 'open' : race.isRelayRace ? 'relay' : race.isSkateabilityRace ? 'skateability' : 'elite',
        is_open_race: !!race.isOpenRace,
        is_quad_race: !!race.isQuadRace,
        is_time_trial: false,
        is_relay_race: !!race.isRelayRace,
        is_skateability_race: !!race.isSkateabilityRace,
        heat_number: race.heatNumber || null,
        is_final: !!race.isFinal,
        parent_race_id: race.parentRaceId || null,
        status: race.status || 'pending',
        notes: race.notes || '',
        order_hint: Math.round(race.orderHint || 0),
        counts_for_overall: race.countsForOverall !== false
      }, { onConflict: 'id' });
      if (raerr) { console.error('    race error:', race.groupLabel, raerr.message); continue; }
      raceCount++;

      // ── LANE ENTRIES ────────────────────────────────────────────────────────
      for (const entry of race.laneEntries || []) {
        if (!entry.skaterName && !entry.registrationId) continue;
        const { error: lerr } = await supabase.from('lane_entries').upsert({
          race_id: race.id,
          meet_id: m.id,
          registration_id: entry.registrationId ? String(entry.registrationId) : null,
          lane: entry.lane || null,
          skater_name: entry.skaterName || '',
          helmet_number: String(entry.helmetNumber || ''),
          team: entry.team || '',
          place: entry.place ? parseInt(entry.place) : null,
          time: entry.time || null,
          status: entry.status || null,
          group_place: entry.groupPlace ? parseInt(entry.groupPlace) : null
        });
        if (lerr) console.error('    lane entry error:', entry.skaterName, lerr.message);
      }
    }
    console.log(`  ✅ ${raceCount} races`);

    // ── BLOCKS ───────────────────────────────────────────────────────────────
    console.log('  📦 Migrating blocks...');
    let blockCount = 0;
    for (const block of m.blocks || []) {
      const { error: berr } = await supabase.from('blocks').upsert({
        id: block.id,
        meet_id: m.id,
        name: block.name || '',
        day: block.day || '',
        notes: block.notes || '',
        order_hint: Math.round(block.orderHint || 0)
      }, { onConflict: 'id' });
      if (berr) { console.error('    block error:', block.name, berr.message); continue; }
      blockCount++;

      // block races
      for (let i = 0; i < (block.raceIds || []).length; i++) {
        const raceId = block.raceIds[i];
        if (!raceId) continue;
        const { error: brerr } = await supabase.from('block_races').upsert({
          block_id: block.id,
          race_id: raceId,
          order_hint: i
        }, { onConflict: 'block_id,race_id' });
        if (brerr) console.error('    block_race error:', brerr.message);
      }
    }
    console.log(`  ✅ ${blockCount} blocks`);

    // ── TEXT ALERTS ──────────────────────────────────────────────────────────
    console.log('  📲 Migrating text alerts...');
    for (const alert of m.textAlerts || []) {
      const { error: aerr } = await supabase.from('text_alerts').upsert({
        id: alert.id,
        created_at: alert.createdAt,
        meet_id: m.id,
        registration_id: alert.registrationId ? String(alert.registrationId) : null,
        skater_name: alert.skaterName || '',
        phone: alert.phone
      }, { onConflict: 'id' });
      if (aerr) console.error('    alert error:', aerr.message);
    }
    console.log(`  ✅ ${m.textAlerts?.length || 0} text alerts`);
  }

  console.log('\n🎉 Migration complete!');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});