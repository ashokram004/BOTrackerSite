export const generateImageReport = async (kpis, tables, metadata) => {
  return new Promise((resolve) => {
    const W = 3200;
    const PAD = 80;

    // Colors
    const TEXT_BRIGHT = '#FFFFFF';
    const TEXT = '#E8E8F0';
    const MUTED = '#A0A0B4';
    const GREEN = '#4ade80';
    const RED = '#f87171';
    const ACCENT = '#f5a623';
    const ORANGE_STRIP = 'rgba(245, 131, 32, 0.78)';

    const formatCurrency = (val) => {
      if (!Number.isFinite(Number(val))) return '$0';

      return `$${Number(val).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}`;
    };

    // Calculate dynamic heights
    const header_h = 160;
    const kpi_h = 200;
    const max_fl_rows = Math.max(tables.languages.length, tables.formats.length);
    const fl_h = 220 + (max_fl_rows * 60);

    const st_actual_rows = Math.max(
      Math.min(16, tables.states.length),
      Math.min(16, tables.theaters.length)
    );
    const st_h = 220 + (st_actual_rows * 60);
    const footer_h = 80;

    let H = PAD + header_h + kpi_h + fl_h + 40 + st_h + 40 + footer_h + PAD;
    if (W / H > 2.0) H = Math.floor(W / 2.0);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // --- BACKGROUND ---
    const bgGradient = ctx.createLinearGradient(0, 0, W, H);
    bgGradient.addColorStop(0, '#080A0F');
    bgGradient.addColorStop(1, '#0F1218');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, W, H);

    // Orbs (Glassmorphism backdrop)
    const drawOrb = (x, y, r, color) => {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    drawOrb(0, 0, 1200, 'rgba(51, 65, 85, 0.4)');
    drawOrb(W - 800, H / 2, 1000, 'rgba(30, 41, 59, 0.5)');
    drawOrb(W / 2, H, 1000, 'rgba(245, 131, 32, 0.05)');

    // --- GLASS PANEL UTILITY ---
    const drawGlassPanel = (x, y, w, h, radius = 24) => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.stroke();
      ctx.restore();
    };

    // --- HEADER ---
    ctx.textBaseline = 'top';
    ctx.fillStyle = TEXT_BRIGHT;
    ctx.font = 'bold 64px Arial, Helvetica, sans-serif';
    ctx.fillText("Peddi", PAD, PAD);

    ctx.fillStyle = ACCENT;
    ctx.font = '28px Arial, Helvetica, sans-serif';
    ctx.fillText(`US Advance Sales • Show Date: ${metadata.showDate}`, PAD, PAD + 85);

    ctx.textAlign = 'right';
    ctx.fillStyle = TEXT;
    ctx.fillText(`Report time: ${metadata.lastUpdated} IST`, W - PAD, PAD + 20);
    ctx.fillStyle = MUTED;
    ctx.fillText(`Growth since: ${metadata.growthSince || 'N/A'} IST`, W - PAD, PAD + 65);

    // Separator line
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + 150);
    ctx.lineTo(W - PAD, PAD + 150);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // --- KPIs ---
    const kpi_y = PAD + 180;
    const kpi_width = (W - (2 * PAD) - (4 * 30)) / 5;

    const drawKpi = (idx, label, val, subVal, isDelta = true) => {
      const x = PAD + (idx * (kpi_width + 30));
      drawGlassPanel(x, kpi_y, kpi_width, 180);

      // Fandango Strip
      ctx.beginPath();
      ctx.roundRect(x, kpi_y, 8, 180, 6);
      ctx.fillStyle = ORANGE_STRIP;
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = MUTED;
      ctx.font = 'bold 22px Arial, Helvetica, sans-serif';
      ctx.fillText(label.toUpperCase(), x + 40, kpi_y + 35);

      ctx.textAlign = 'right';
      ctx.font = 'bold 26px Arial, Helvetica, sans-serif';
      let color = MUTED;
      if (isDelta && subVal) {
        if (subVal.startsWith('+')) color = GREEN;
        else if (subVal.startsWith('-') && subVal !== '-') color = RED;
      }
      ctx.fillStyle = color;
      ctx.fillText(subVal, x + kpi_width - 30, kpi_y + 35);

      ctx.textAlign = 'left';
      ctx.fillStyle = TEXT_BRIGHT;
      ctx.font = 'bold 72px Arial, Helvetica, sans-serif';
      ctx.fillText(val, x + 40, kpi_y + 75);
    };

    // Filter out 0 deltas using rounded logic to avoid floating point anomalies
    const roundedGrossDelta = Math.round(kpis.totalGross.delta || 0);
    const d_gross_str = roundedGrossDelta === 0 ? "" : (roundedGrossDelta > 0 ? `+${formatCurrency(kpis.totalGross.delta)}` : `-${formatCurrency(Math.abs(kpis.totalGross.delta))}`);
    
    const d_tix_str = kpis.totalBooked.delta === 0 ? "" : (kpis.totalBooked.delta > 0 ? `+${kpis.totalBooked.delta.toLocaleString()}` : kpis.totalBooked.delta.toLocaleString());
    const d_venues_str = kpis.totalVenues.delta === 0 ? "" : (kpis.totalVenues.delta > 0 ? `+${kpis.totalVenues.delta}` : `${kpis.totalVenues.delta}`);
    const d_shows_str = kpis.totalShows.delta === 0 ? "" : (kpis.totalShows.delta > 0 ? `+${kpis.totalShows.delta}` : `${kpis.totalShows.delta}`);

    drawKpi(0, "Total Gross", formatCurrency(kpis.totalGross.val), d_gross_str);
    drawKpi(1, "Tickets Sold", kpis.totalBooked.val.toLocaleString(), d_tix_str);
    drawKpi(2, "Total Venues", kpis.totalVenues.val.toLocaleString(), d_venues_str);
    drawKpi(3, "Total Shows", kpis.totalShows.val.toLocaleString(), d_shows_str);
    drawKpi(4, "Occupancy", `${kpis.occupancy.val.toFixed(1)}%`, `${kpis.occupancy.capacity?.toLocaleString() || 0} seats`, false);

    // --- TABLE DRAW UTILITY ---
    const drawTable = (x, y, w, h, title, cols, rawDataRows, isFmtLang = false, isTheater = false) => {
      drawGlassPanel(x, y, w, h);
      ctx.textAlign = 'left';
      ctx.fillStyle = TEXT_BRIGHT;
      ctx.font = 'bold 36px Arial, Helvetica, sans-serif';
      ctx.fillText(title, x + 35, y + 35);

      const th_y = y + 90;
      
      // Header overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(x, th_y, w, 55);
      ctx.beginPath();
      ctx.moveTo(x, th_y); ctx.lineTo(x + w, th_y);
      ctx.moveTo(x, th_y + 55); ctx.lineTo(x + w, th_y + 55);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Headers
      ctx.fillStyle = MUTED;
      ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
      cols.forEach(c => {
        ctx.textAlign = c.align;
        const cx = c.align === 'left' ? x + c.pos : x + w - c.pos;
        ctx.fillText(c.name.toUpperCase(), cx, th_y + 15);
      });

      // Data Processing (Top 15 + Remaining logic)
      let displayRows = [];
      if (rawDataRows.length > 15) {
        displayRows = rawDataRows.slice(0, 15);
        const rem = rawDataRows.slice(15);
        const remRow = rem.reduce((acc, curr) => ({
          name: `Remaining ${rem.length} ${isTheater ? 'Theaters' : 'States'}`,
          shows: acc.shows + curr.shows,
          tickets: acc.tickets + curr.tickets,
          booked: acc.booked + curr.booked,
          gross: acc.gross + curr.gross,
          d_gross: acc.d_gross + curr.d_gross,
        }), { shows: 0, tickets: 0, booked: 0, gross: 0, d_gross: 0 });
        remRow.occ = remRow.tickets > 0 ? (remRow.booked / remRow.tickets) * 100 : 0;
        displayRows.push(remRow);
      } else {
        displayRows = rawDataRows;
      }

      let cy = th_y + 80;
      displayRows.forEach(row => {
        cols.forEach(c => {
          ctx.textAlign = c.align;
          const cx = c.align === 'left' ? x + c.pos : x + w - r2_y; // Fallback math context placeholder alignment pos fix
          const finalCx = c.align === 'left' ? x + c.pos : x + w - c.pos;
          
          let val = row[c.key];
          let color = TEXT;
          let fontStr = 'bold 28px Arial, Helvetica, sans-serif';

          // Formatting logic
          if (c.key === 'shows' || c.key === 'booked') val = val.toLocaleString();
          if (c.key === 'gross') val = `$${val.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
          if (c.key === 'occ') val = `${val.toFixed(1)}%`;
          
          // FIX: Round the delta value first to catch decimals that round to zero
          if (c.key === 'dgross') {
            const roundedRowDelta = Math.round(row.d_gross || 0);
            if (roundedRowDelta === 0) {
              val = "";
            } else {
              val = roundedRowDelta > 0 ? `+$${roundedRowDelta.toLocaleString(undefined, {maximumFractionDigits: 0})}` : `-$${Math.abs(roundedRowDelta).toLocaleString(undefined, {maximumFractionDigits: 0})}`;
            }
          }

          if (c.key === 'name') {
            color = isFmtLang ? ACCENT : TEXT_BRIGHT;
            if (val.length > 32) val = val.substring(0, 35) + "...";
            if (val.includes('Remaining')) color = MUTED;
          } else if (c.key === 'gross') {
            color = TEXT_BRIGHT;
          } else if (c.key === 'occ') {
            color = TEXT_BRIGHT;
          } else if (c.key === 'dgross') {
            if (val === "") color = MUTED; 
            else if (val.startsWith('+')) color = GREEN;
            else if (val.startsWith('-')) color = RED;
          }

          ctx.fillStyle = color;
          ctx.font = fontStr;
          ctx.fillText(val, finalCx, cy);
        });

        // Row border
        ctx.beginPath();
        ctx.moveTo(x + 40, cy + 45);
        ctx.lineTo(x + w - 40, cy + 45);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.stroke();

        cy += 60;
      });
    };

    const col_w = (W - (2 * PAD) - 40) / 2;
    const r2_y = kpi_y + 220;
    
    const standardCols = [
      { name: 'Name', key: 'name', pos: 40, align: 'left' },
      { name: 'Shows', key: 'shows', pos: 800, align: 'right' },
      { name: 'Booked', key: 'booked', pos: 610, align: 'right' },
      { name: 'Gross', key: 'gross', pos: 420, align: 'right' },
      { name: 'Occ %', key: 'occ', pos: 230, align: 'right' },
      { name: 'Δ Gross', key: 'dgross', pos: 40, align: 'right' }
    ];

    drawTable(PAD, r2_y, col_w, fl_h, "Format Distribution", standardCols, tables.formats, true, false);
    drawTable(PAD + col_w + 40, r2_y, col_w, fl_h, "Language Distribution", standardCols, tables.languages, true, false);

    const r3_y = r2_y + fl_h + 40;
    drawTable(PAD, r3_y, col_w, st_h, "Top 15 States", standardCols, tables.states, false, false);
    drawTable(PAD + col_w + 40, r3_y, col_w, st_h, "Top 15 Theaters", standardCols, tables.theaters, false, true);

    // --- FOOTER ---
    const footer_y = r3_y + st_h + 40;
    ctx.beginPath();
    ctx.moveTo(PAD, footer_y);
    ctx.lineTo(W - PAD, footer_y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED;
    ctx.font = '28px Arial, Helvetica, sans-serif';
    ctx.fillText(`Wknd Cinema • Data from Fandango • Generated at ${metadata.lastUpdated} IST`, W / 2, footer_y + 30);

    resolve(canvas.toDataURL("image/png"));
  });
};