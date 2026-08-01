/**
 * Rate Engine — calculates parking fees based on tenant settings
 * All calculation logic lives HERE (on the server), never in the frontend.
 */

/**
 * @param {object} record — parking record from DB
 * @param {object} settings — tenant settings from DB
 * @param {Date} exitTime — when the vehicle is exiting
 * @returns {{ fee: number, durationMinutes: number }}
 */
function calculateFee(record, settings, exitTime) {
  const entry = new Date(record.entry_time)
  const exit = exitTime instanceof Date ? exitTime : new Date(exitTime)

  // Total duration in minutes
  const totalMinutes = Math.max(0, Math.floor((exit - entry) / 60000))

  // Grace period — if within grace period, no charge
  const gracePeriod = parseInt(settings.grace_period_minutes) || 10
  if (totalMinutes <= gracePeriod) {
    return { fee: 0, durationMinutes: totalMinutes }
  }

  const type = record.vehicle_type || '2-Wheeler'

  // Get rates from settings
  let firstCharge = 0
  let perHourCharge = 0
  let entryFee = 0

  if (type === '2-Wheeler' || type === 'Bike') {
    firstCharge = parseFloat(settings.rate_two_wheeler_first) || 20
    perHourCharge = parseFloat(settings.rate_two_wheeler_per_hour) || 10
    entryFee = parseFloat(settings.entry_fee_two_wheeler) || 0
  } else if (type === '4-Wheeler' || type === 'Car') {
    firstCharge = parseFloat(settings.rate_four_wheeler_first) || 40
    perHourCharge = parseFloat(settings.rate_four_wheeler_per_hour) || 20
    entryFee = parseFloat(settings.entry_fee_four_wheeler) || 0
  } else if (type === 'Heavy') {
    firstCharge = parseFloat(settings.rate_heavy_first) || 80
    perHourCharge = parseFloat(settings.rate_heavy_per_hour) || 40
    entryFee = parseFloat(settings.entry_fee_heavy) || 0
  }

  // Calculate fee: first block charge + per-hour for additional hours
  const extraMinutes = Math.max(0, totalMinutes - 60) // minutes beyond first hour
  const extraHours = Math.ceil(extraMinutes / 60)
  const parkingFee = firstCharge + (extraHours * perHourCharge)

  // Total = parking fee + entry fee (entry fee is subtracted at exit if already paid)
  const totalFee = parkingFee + entryFee

  // Apply GST if configured
  const gstPercent = parseFloat(settings.gst_percent) || 0
  const finalFee = gstPercent > 0
    ? Math.ceil(totalFee * (1 + gstPercent / 100))
    : Math.ceil(totalFee)

  return { fee: finalFee, durationMinutes: totalMinutes }
}

module.exports = { calculateFee }
