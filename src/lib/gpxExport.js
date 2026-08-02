/**
 * Convert an array of ski_runs rows (with gps_track JSONB) into a GPX XML string.
 *
 * @param {Array} runs        - ski_runs rows, each with gps_track: [{lat,lng,alt,t}]
 * @param {string} trackName  - e.g. "Breckenridge - Jan 15, 2026"
 * @returns {string}          - GPX XML string
 */
export function runsToGpx(runs, trackName) {
  // Flatten all segments into a single ordered point stream, sorted by timestamp
  const allPoints = (runs || [])
    .flatMap((run) => run.gps_track ?? [])
    .sort((a, b) => a.t - b.t)

  if (!allPoints.length) {
    throw new Error("No GPS track data available for this session.")
  }

  const trkpts = allPoints
    .map((pt) => {
      const ele = pt.alt != null ? `\n        <ele>${Number(pt.alt).toFixed(1)}</ele>` : ""
      const time = `\n        <time>${new Date(pt.t).toISOString()}</time>`
      return `      <trkpt lat="${Number(pt.lat).toFixed(6)}" lon="${Number(pt.lng).toFixed(6)}">${ele}${time}\n      </trkpt>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PowderDays"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}

/**
 * Trigger a browser download of a GPX string as a .gpx file.
 */
export function gpxDownload(gpxString, filename) {
  const blob = new Blob([gpxString], { type: "application/gpx+xml" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;")
}
