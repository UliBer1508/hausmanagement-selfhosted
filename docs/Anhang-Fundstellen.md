# Anhang: Alle Fundstellen (maschinell erzeugt, 13.08.2026)

## Frontend — Buchungs-Lesestellen
src/components/Bookings/BookingOverviewFixed.tsx:366:        return (a.guest_name || '').localeCompare(b.guest_name || '', 'de');
src/components/Bookings/BookingOverviewFixed.tsx:368:        return (b.guest_name || '').localeCompare(a.guest_name || '', 'de');
src/components/Bookings/BookingOverviewFixed.tsx:913:          const countryCode = getCountryCode(booking.nationality);
src/components/Bookings/BookingOverviewFixed.tsx:920:              aria-label={`Buchung von ${booking.guest_name} bearbeiten`}
src/components/Bookings/BookingOverviewFixed.tsx:974:                          {booking.guest_name}
src/components/Bookings/BookingOverviewFixed.tsx:978:                              title={getFullCountryName(booking.nationality)}
src/components/Bookings/CreateBookingForm.tsx:437:        console.log('Checking booking:', (booking as any).guests?.name || booking.guest_name, booking.status);
src/components/Bookings/CreateBookingForm.tsx:456:          console.log('❌ CONFLICT FOUND with:', (booking as any).guests?.name || booking.guest_name);
src/components/Bookings/CreateBookingForm.tsx:845:          ? `${data.total_items} Teile für ${data.booking.guest_name} - Geschätzte Kosten: ${data.estimated_cost} EUR`
src/components/Bookings/CreateBookingForm.tsx:846:          : `${data.total_items} Teile für ${data.booking.guest_name} - Kosten nicht berechenbar (keine Preise hinterlegt)`
src/components/Bookings/EditBookingDialog.tsx:57:            Bearbeiten Sie die Buchungsdetails für {booking.guest_name}
src/components/Calendar/BookingTimeline.tsx:315:                  const firstName = booking.guest_name.split(' ')[0];
src/components/Calendar/BookingTimeline.tsx:336:                      title={`${booking.guest_name} - ${nights} Nächte (${booking.number_of_guests} Gäste)`}
src/components/Calendar/BookingTimeline.tsx:343:                              title={`Reinigung · ${booking.guest_name} · ${cleaningTask.status}${cleaningTask.scheduled_date ? ' · ' + format(parseLocalDate(cleaningTask.scheduled_date), 'dd.MM.yyyy', { locale: de }) : ''}`}
src/components/Calendar/BookingTimeline.tsx:344:                              onClick={(e) => { e.stopPropagation(); onCleaningClick?.(cleaningTask, booking.guest_name); }}
src/components/Calendar/BookingTimeline.tsx:352:                              title={`Wäsche · ${booking.guest_name} · ${linenOrder.status}${linenOrder.delivery_date ? ' · Lieferung ' + format(parseLocalDate(linenOrder.delivery_date), 'dd.MM.yyyy', { locale: de }) : ''}`}
src/components/Calendar/BookingTimeline.tsx:353:                              onClick={(e) => { e.stopPropagation(); onLinenClick?.(linenOrder, booking.guest_name); }}
src/components/Calendar/HouseStackedCalendar.tsx:386:                      info.status === 'occupied' ? info.occupying.guest_name
src/components/Calendar/HouseStackedCalendar.tsx:387:                      : info.status === 'checkin' ? `Anreise: ${info.arriving.guest_name}`
src/components/Calendar/HouseStackedCalendar.tsx:388:                      : info.status === 'checkout' ? `Abreise: ${info.departing.guest_name}`
src/components/Calendar/HouseStackedCalendar.tsx:389:                      : info.status === 'changeover' ? `Abreise: ${info.departing.guest_name} / Anreise: ${info.arriving.guest_name}`
src/components/Calendar/HouseStackedCalendar.tsx:405:                            {info.occupying.guest_name.split(' ')[0]}
src/components/Calendar/HouseStackedCalendar.tsx:413:                                onClick={(e) => { e.stopPropagation(); onCleaningClick(cleaningTask, arriving?.guest_name); }}
src/components/Calendar/HouseStackedCalendar.tsx:414:                                title={`Reinigung · ${arriving?.guest_name ?? ''} · ${cleaningTask.status}${cleaningTask.scheduled_date ? ' · ' + format(parseLocalDate(cleaningTask.scheduled_date), 'dd.MM.yyyy') : ''}`}
src/components/Calendar/HouseStackedCalendar.tsx:422:                                onClick={(e) => { e.stopPropagation(); onLinenClick(linenOrder, arriving?.guest_name); }}
src/components/Calendar/HouseStackedCalendar.tsx:423:                                title={`Wäsche · ${arriving?.guest_name ?? ''} · ${linenOrder.status}${linenOrder.delivery_date ? ' · Lieferung ' + format(parseLocalDate(linenOrder.delivery_date), 'dd.MM.yyyy') : ''}`}
src/components/Cleaning/CleaningManagement.tsx:164:          booking.guest_name?.toLowerCase().includes(term) ||
src/components/Cleaning/CreateCleaningTaskDialog.tsx:510:                      {displayBooking.guest_email && (
src/components/Cleaning/CreateCleaningTaskDialog.tsx:511:                        <div><strong>E-Mail:</strong> {displayBooking.guest_email}</div>
src/components/Cleaning/EditCleaningTaskDialog.tsx:430:                    <span className="font-medium">{task.bookings?.guest_name}</span>
src/components/Cleaning/EditCleaningTaskDialog.tsx:432:                  {task.bookings?.guest_email && (
src/components/Cleaning/EditCleaningTaskDialog.tsx:435:                      <span className="text-sm">{task.bookings.guest_email}</span>
src/components/Cleaning/EditCleaningTaskDialog.tsx:438:                  {task.bookings?.guest_phone && (
src/components/Cleaning/EditCleaningTaskDialog.tsx:441:                      <span className="text-sm">{task.bookings.guest_phone}</span>
src/components/Dashboard/CalendarTab.tsx:34:      title: `Buchung: ${booking.guest_name}`,
src/components/Dashboard/CalendarTab.tsx:35:      booking: { ...booking, guest: booking.guest_name, house: booking.houses?.name || 'Unbekannt', checkIn: booking.check_in, checkOut: booking.check_out },
src/components/Dashboard/CalendarTab.tsx:44:      title: `Wechsel: ${departing.guest_name.split(' ')[0]} → ${arriving.guest_name.split(' ')[0]}`,
src/components/Dashboard/CalendarTab.tsx:45:      departing: { ...departing, guest: departing.guest_name, house: houseName },
src/components/Dashboard/CalendarTab.tsx:46:      arriving: { ...arriving, guest: arriving.guest_name, house: houseName },
src/components/Dashboard/GuestContactAlertBanner.tsx:115:                  title={booking.guest_email ? `E-Mail an ${booking.guest_email} schreiben` : 'Keine E-Mail hinterlegt'}
src/components/Dashboard/GuestContactAlertBanner.tsx:125:                        <span className="font-medium text-foreground break-words min-w-0">{booking.guest_name}</span>
src/components/Dashboard/GuestContactAlertBanner.tsx:158:                        {booking.guest_email && (
src/components/Dashboard/GuestContactAlertBanner.tsx:166:                            title={booking.guest_email}
src/components/Dashboard/GuestContactAlertBanner.tsx:169:                            <span className="hidden sm:inline truncate max-w-[150px]">{booking.guest_email}</span>
src/components/Dashboard/GuestContactAlertBanner.tsx:172:                        {booking.guest_phone && (
src/components/Dashboard/GuestContactAlertBanner.tsx:174:                            href={`tel:${booking.guest_phone}`}
src/components/Dashboard/GuestContactAlertBanner.tsx:177:                            title={booking.guest_phone}
src/components/Dashboard/GuestContactAlertBanner.tsx:180:                            <span className="hidden sm:inline">{booking.guest_phone}</span>
src/components/Dashboard/GuestContactAlertBanner.tsx:190:                        onClick={(e) => { e.stopPropagation(); handleMarkNotRequired(booking.id, booking.guest_name); }}
src/components/Dashboard/GuestContactAlertBanner.tsx:199:                        onClick={(e) => { e.stopPropagation(); handleMarkContacted(booking.id, booking.guest_name); }}
src/components/Dashboard/GuestContactAlertBanner.tsx:26:      nationality: b.nationality,
src/components/Dashboard/GuestContactAlertBanner.tsx:27:      guest_email: b.guest_email,
src/components/Dashboard/GuestContactAlertBanner.tsx:68:    if (!booking.guest_email) {
src/components/Dashboard/GuestContactAlertBanner.tsx:71:        description: `Für ${booking.guest_name} ist keine E-Mail vorhanden. Bitte Gastdaten prüfen.`,
src/components/Dashboard/GuestContactAlertBanner.tsx:79:    const body = `Liebe/r ${booking.guest_name},\n\nwir freuen uns auf Ihre Anreise am ${checkInDate}${houseName ? ` in ${houseName}` : ''}.\n\nFür Rückfragen sind wir jederzeit erreichbar.\n\nHerzliche Grüße\nSteinbock Chalets`;
src/components/Dashboard/GuestContactAlertBanner.tsx:80:    await openEmail({ to: booking.guest_email, subject, text: body });
src/components/Dashboard/RatingReminderBanner.tsx:55:            <span className="font-medium truncate">{reminder.guest_name}</span>
src/components/Dashboard/RatingReminderBanner.tsx:94:                  handleMarkAsNoRating(reminder.id, reminder.guest_name);
src/components/Dashboard/RealDataDashboard.tsx:161:                        <h4 className="font-semibold">{booking.guest_name}</h4>
src/components/Dashboard/RealDataDashboard.tsx:60:          title: `Check-in: ${booking.guest_name}`,
src/components/Dashboard/RealDataDashboard.tsx:69:          title: `Check-out: ${booking.guest_name}`,
src/components/Dashboard/RecentBookings.tsx:54:          const initials = booking.guest_name?.split(' ').map(n => n[0]).join('') || 'G';
src/components/Dashboard/RecentBookings.tsx:66:                  <h4 className="font-semibold text-foreground">{booking.guest_name}</h4>
src/components/Guests/ActionDetailsDialog.tsx:160:                                  <span className="font-medium truncate">{booking.guest_name}</span>
src/components/Guests/ActionDetailsDialog.tsx:250:                                  <span className="font-medium truncate">{booking.guest_name}</span>
src/components/Guests/AppReviewsSection.tsx:293:                        <div className="font-semibold">{booking.guest_name}</div>
src/components/Guests/AppReviewsSection.tsx:294:                        {booking.nationality && (
src/components/Guests/AppReviewsSection.tsx:295:                          <div className="text-xs text-muted-foreground">{booking.nationality}</div>
src/components/Guests/AppReviewsSection.tsx:304:                            onClick={() => openEmail({ to: booking.guest_email })}
src/components/Guests/AppReviewsSection.tsx:309:                          {booking.guest_phone && (
src/components/Guests/AppReviewsSection.tsx:310:                            <a href={`tel:${booking.guest_phone}`}>
src/components/Guests/GuestAnalytics.tsx:156:      guestName: b.guest_name,
src/components/Guests/GuestAnalytics.tsx:159:      nationality: b.nationality || 'N/A',
src/components/Guests/GuestAnalytics.tsx:215:    const n = b.nationality || 'N/A';
src/components/Guests/GuestAnalytics.tsx:461:    return bMonth === month && b.nationality && b.status !== 'cancelled';
src/components/Guests/GuestAnalytics.tsx:465:    const n = b.nationality;
src/components/Guests/GuestAnalytics.tsx:672:        const nationality = booking.nationality || 'Unbekannt';
src/components/Guests/GuestManagement.tsx:50:        const guestKey = getGuestKey(booking) || `${booking.guest_name}-${booking.guest_email || ''}-${booking.guest_phone || ''}`;
src/components/Guests/GuestManagement.tsx:54:            guest_name: booking.guest_name,
src/components/Guests/GuestManagement.tsx:55:            guest_email: booking.guest_email,
src/components/Guests/GuestManagement.tsx:56:            guest_phone: booking.guest_phone,
src/components/Guests/GuestManagement.tsx:57:            nationality: booking.nationality,
src/components/Guests/GuestPersonalization.tsx:267:    .sort((a, b) => a.guest_name.localeCompare(b.guest_name));
src/components/Houses/BookingLinenOverview.tsx:290:                    <div className="font-medium">{booking.guest_name}</div>
src/components/Houses/BookingLinenOverview.tsx:370:                      <CardTitle className="text-lg">{booking.guest_name}</CardTitle>
src/components/Houses/BookingWithoutOrderCard.tsx:34:            <h3 className="font-semibold text-lg">{booking.guest_name}</h3>
src/components/Houses/LinenDashboard.tsx:760:                        <span>{order.bookings?.guest_name || 'Ohne Buchung'}</span>
src/components/Houses/LinenOrderAnalytics.tsx:642:                            <p className="font-medium">{booking.guest_name}</p>
src/components/Houses/LinenOrderDialog.tsx:687:                      {booking.guest_name} ({booking.number_of_guests} Gäste) - {
src/components/Houses/LinenOrderEmailDialog.tsx:81:Gast: ${order.bookings.guest_name}
src/components/Houses/LinenOrdersTab.tsx:446:                <span className="ml-1">{order.bookings.guest_name}</span>
src/components/Houses/SmartLinenSettings.tsx:240:                            {booking.guest_name} ({format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })})
src/components/ServicePortal/AssignOrdersToInvoiceDialog.tsx:519:                        <TableCell>{order.bookings?.guest_name || '-'}</TableCell>
src/components/ServicePortal/LaundryOrdersOverview.tsx:202:                    <TableCell>{order.bookings?.guest_name || '-'}</TableCell>
src/components/ServicePortal/ProviderBillingDialog.tsx:228:                      <TableCell>{task.bookings?.guest_name || '-'}</TableCell>
src/components/ServicePortal/TeuniOrdersOverview.tsx:285:                    <TableCell>{order.bookings?.guest_name || '-'}</TableCell>
src/components/Settings/GuestImportCard.tsx:542:      nationality: booking.nationality,
src/components/Settings/GuestImportCard.tsx:570:        nationality: editValues.nationality || b.nationality,
src/components/Settings/GuestImportCard.tsx:915:                          <TableCell>{booking.nationality || '-'}</TableCell>
src/hooks/useBookingLinenOrders.ts:161:          guest_name: (booking as any).guests?.name || booking.guest_name,
src/hooks/useBookingLinenOrders.ts:332:      return a.guest_name.localeCompare(b.guest_name);
src/hooks/useBookingMarketingActions.ts:65:  if (criteria.nationality && booking.nationality) {
src/hooks/useBookingMarketingActions.ts:66:    if (!booking.nationality.toLowerCase().includes(criteria.nationality.toLowerCase())) {
src/hooks/useGuestAppTracking.ts:174:                              (booking?.guest_email as string) || 
src/hooks/useGuestAppTracking.ts:179:                             (booking?.guest_name as string) || 
src/hooks/useGuestAppTracking.ts:187:          booking_guest_name: booking?.guest_name as string | undefined,
src/hooks/useGuestAppTracking.ts:188:          booking_guest_email: booking?.guest_email as string | undefined,
src/hooks/useGuests.ts:365:          guestKey = `legacy_${booking.guest_name}_${booking.guest_email || ''}`;
src/hooks/useGuests.ts:370:              guest_name: (booking as any).guests?.name || booking.guest_name,
src/hooks/useGuests.ts:371:              guest_email: (booking as any).guests?.email || booking.guest_email,
src/hooks/useGuests.ts:372:              guest_phone: (booking as any).guests?.phone || booking.guest_phone,
src/hooks/useGuests.ts:373:              nationality: booking.nationality,
src/hooks/useMarketingActions.ts:166:    if (targetCriteria.nationality && booking.nationality !== targetCriteria.nationality) {
src/hooks/useOperationsDashboard.ts:104:        guestName: (b as any).guests?.name || b.guest_name,
src/hooks/useOperationsDashboard.ts:139:        guestName: (b as any).guests?.name || b.guest_name,
src/hooks/useOptimizedLinenManagement.ts:226:              guestName: booking.guest_name,
src/hooks/useOptimizedLinenManagement.ts:90:      console.log(`  Week: ${booking.guest_name} = ${booking.number_of_guests} × ${linenDef[perGuestKey]} = ${demand}`);
src/hooks/useOptimizedLinenManagement.ts:93:      console.log(`  Week: ${booking.guest_name} = ${linenDef[perBookingKey]}`);
src/hooks/useRatingReminders.ts:167:      guest_name: (booking as any).guests?.name || booking.guest_name,
src/hooks/useRatingReminders.ts:168:      guest_email: (booking as any).guests?.email || booking.guest_email,
src/hooks/useRebookingScore.ts:125:          || `${booking.guest_name}|${booking.guest_email || ''}`;
src/hooks/useRebookingScore.ts:129:            guest_name: booking.guests?.name || booking.guest_name,
src/hooks/useRebookingScore.ts:130:            guest_email: booking.guests?.email || booking.guest_email,
src/hooks/useRebookingScore.ts:131:            guest_phone: booking.guests?.phone || booking.guest_phone,
src/hooks/useRebookingScore.ts:132:            nationality: booking.guests?.nationality || booking.nationality,
src/hooks/useRebookingScore.ts:89:        if (!b.guest_name) return;
src/hooks/useRebookingScore.ts:90:        rebookedKeys.add(`${b.guest_name}|${b.guest_email || ''}`);
src/lib/guestHelpers.ts:28:  return booking.guests?.name || booking.guest_name || 'Unbekannt';
src/lib/guestHelpers.ts:36:  return booking.guests?.email || booking.guest_email || null;
src/lib/guestHelpers.ts:44:  return booking.guests?.phone || booking.guest_phone || null;
src/lib/guestHelpers.ts:52:  return booking.guests?.nationality || booking.nationality || null;
src/lib/guestHelpers.ts:60:  return booking.guests?.street || booking.guest_street || null;
src/lib/guestHelpers.ts:68:  return booking.guests?.city || booking.guest_city || null;
src/lib/guestHelpers.ts:76:  return booking.guests?.postal_code || booking.guest_postal_code || null;
src/lib/guestHelpers.ts:84:  return booking.guests?.birth_date || booking.guest_birth_date || null;
src/lib/guestHelpers.ts:92:  return booking.guests?.travel_document || booking.guest_travel_document || null;
src/lib/guestKeyHelpers.ts:37:  const email = (booking.guest_email || '').trim().toLowerCase();
src/lib/guestKeyHelpers.ts:40:  const name = (booking.guest_name || '').trim().toLowerCase();
src/pages/OriginalDashboard.tsx:1045:        const guestName = booking?.guest_name || 'Gast';
src/pages/OriginalDashboard.tsx:1124:        guest: booking.guest_name.split(' ')[0],
src/pages/OriginalDashboard.tsx:727:        const matchesGuest = booking.guest_name?.toLowerCase().includes(searchLower);
src/services/marketOccupancyService.ts:58: * Top 5 ISO-Codes aus guests.nationality, Fallback bookings.nationality,
src/services/marketOccupancyService.ts:87: * Top 5 ISO-Codes aus guests.nationality, Fallback bookings.nationality,

## Edge Functions — alle Treffer ohne Tool-Beschreibungen
supabase/functions/analyze-vacancy/index.ts:109:          nationality: b.nationality,
supabase/functions/analyze-vacancy/index.ts:76:      const nat = booking.nationality || 'unknown';
supabase/functions/auto-create-linen-orders/index.ts:101:          const guestName = (booking as any).guests?.name || booking.guest_name;
supabase/functions/auto-create-linen-orders/index.ts:132:        .select('id, guest_name, check_in, number_of_guests, guests!bookings_guest_id_fkey(name)')
supabase/functions/auto-create-linen-orders/index.ts:157:        const guestName = (booking as any).guests?.name || booking.guest_name;
supabase/functions/auto-create-linen-orders/index.ts:302:              guest_name: guestName,
supabase/functions/auto-create-linen-orders/index.ts:92:          .select('id, guest_name, check_in, guests!bookings_guest_id_fkey(name)')
supabase/functions/chat-assistant/index.ts:1031:      id, guest_name, guest_email, guest_phone, check_in, check_out,
supabase/functions/chat-assistant/index.ts:1032:      number_of_guests, number_of_children, guest_contact_status, nationality,
supabase/functions/chat-assistant/index.ts:104:      guest_name: inquiry.guest_name,
supabase/functions/chat-assistant/index.ts:1057:      guest_name: b.guest_name,
supabase/functions/chat-assistant/index.ts:1058:      guest_email: b.guest_email || null,
supabase/functions/chat-assistant/index.ts:1059:      has_email: !!b.guest_email,
supabase/functions/chat-assistant/index.ts:105:      guest_email: inquiry.guest_email,
supabase/functions/chat-assistant/index.ts:1060:      guest_phone: b.guest_phone || null,
supabase/functions/chat-assistant/index.ts:1066:      nationality: b.nationality || null,
supabase/functions/chat-assistant/index.ts:106:      guest_phone: inquiry.guest_phone,
supabase/functions/chat-assistant/index.ts:1114:    .select('id, guest_name, check_out, platform, external_rating, houses(name, rental_type)')
supabase/functions/chat-assistant/index.ts:1141:    guest_name: b.guest_name,
supabase/functions/chat-assistant/index.ts:1162:  // 1) Buchung ermitteln — per booking_id ODER per guest_name (automatische Auswahl).
supabase/functions/chat-assistant/index.ts:1167:      .select('id, guest_name, guest_email, check_in, check_out, nationality, houses(name)')
supabase/functions/chat-assistant/index.ts:1172:  } else if (params?.guest_name) {
supabase/functions/chat-assistant/index.ts:1176:      .select('id, guest_name, guest_email, check_in, check_out, nationality, status, houses(name)')
supabase/functions/chat-assistant/index.ts:1177:      .ilike('guest_name', `%${params.guest_name}%`)
supabase/functions/chat-assistant/index.ts:1188:        error: `Ich habe keine (nicht stornierte) Buchung zu „${params.guest_name}" gefunden. Bitte prüfe die Schreibweise oder nenne den Namen genauer.`,
supabase/functions/chat-assistant/index.ts:1196:      new Set(list.map((b: any) => (b.guest_name || '').trim().toLowerCase()))
supabase/functions/chat-assistant/index.ts:1202:        error: `Es gibt mehrere Gäste, auf die „${params.guest_name}" passt. Für wen soll ich die Begrüßungs-E-Mail vorbereiten?`,
supabase/functions/chat-assistant/index.ts:1205:          guest_name: b.guest_name,
supabase/functions/chat-assistant/index.ts:1208:          hat_email: !!b.guest_email,
supabase/functions/chat-assistant/index.ts:1216:      list.find((b: any) => b.guest_email && String(b.check_in || '').split('T')[0] >= todayStr) ||
supabase/functions/chat-assistant/index.ts:1217:      list.find((b: any) => b.guest_email) ||
supabase/functions/chat-assistant/index.ts:1220:    // Weder booking_id noch guest_name: NICHT raten, sondern zurückfragen.
supabase/functions/chat-assistant/index.ts:1231:  if (!booking.guest_email) {
supabase/functions/chat-assistant/index.ts:1232:    return { success: false, error: `Für ${booking.guest_name || 'diesen Gast'} ist keine E-Mail-Adresse hinterlegt. Es reicht die telefonische Erinnerung.` };
supabase/functions/chat-assistant/index.ts:1271:    .replace(/\{guestName\}/gi, booking.guest_name || 'Gast')
supabase/functions/chat-assistant/index.ts:1272:    .replace(/\{guest_name\}/gi, booking.guest_name || 'Gast')
supabase/functions/chat-assistant/index.ts:1284:      to: booking.guest_email,
supabase/functions/chat-assistant/index.ts:1285:      guest_name: booking.guest_name,
supabase/functions/chat-assistant/index.ts:1294:    hinweis: `Begrüßungs-E-Mail (${lang.toUpperCase()}) für ${booking.guest_name} vorbereitet. Es wurde NICHTS gesendet — im Chat erscheint ein Button, der das Vorschaufenster vorausgefüllt öffnet. Dort Betreff/Text prüfen und "Per Gmail senden".`,
supabase/functions/chat-assistant/index.ts:135:      notes: `Reinigung nach Abreise von ${inquiry.guest_name}`
supabase/functions/chat-assistant/index.ts:1484:            guest_name: { type: "string" },
supabase/functions/chat-assistant/index.ts:1515:            nationality: { type: "string" }
supabase/functions/chat-assistant/index.ts:153:    guest_name: inquiry.guest_name,
supabase/functions/chat-assistant/index.ts:162:    guest_name: inquiry.guest_name,
supabase/functions/chat-assistant/index.ts:1869:      bookings!service_tasks_booking_id_fkey(guest_name)
supabase/functions/chat-assistant/index.ts:191:    guest_name: data.guest_name,
supabase/functions/chat-assistant/index.ts:1940:  const gast = (task as any).bookings?.guest_name ?? 'Buchung';
supabase/functions/chat-assistant/index.ts:1964:    guest_name: gast,
supabase/functions/chat-assistant/index.ts:199:    guest_name: data.guest_name,
supabase/functions/chat-assistant/index.ts:2183:    .select('id, guest_name, check_in, check_out, status, payment_status, house_id, houses(name)')
supabase/functions/chat-assistant/index.ts:2195:    const label = `${b.guest_name} (Anreise ${formatDateDE(b.check_in)}, ${houseName})`;
supabase/functions/chat-assistant/index.ts:2292:      .select('id, scheduled_date, scheduled_time, status, houses(name), bookings(guest_name)')
supabase/functions/chat-assistant/index.ts:2303:      const gast = t.bookings?.guest_name || 'Gast';
supabase/functions/chat-assistant/index.ts:2404:      hinweis: `Wäschebestellung für ${data.guest_name || 'den Gast'} angelegt (${data.total_items ?? '?'} Teile, Status "offen"). Bitte prüfe sie und setze sie auf "ausstehend", um sie zu bestätigen.`,
supabase/functions/chat-assistant/index.ts:240:  if (params.guest_name) {
supabase/functions/chat-assistant/index.ts:241:    query = query.ilike('guest_name', `%${params.guest_name}%`);
supabase/functions/chat-assistant/index.ts:2537:        hinweis: `Es gab noch keine Bestellung — es wurde eine neue für ${created.guest_name || 'den Gast'} angelegt (${angelegteMenge} Teile, Status "offen"). Bitte prüfe sie und setze sie auf "ausstehend". Danach sollte Teuni informiert werden.`,
supabase/functions/chat-assistant/index.ts:2579:          .select('id, scheduled_date, status, booking_id, bookings(guest_name), houses(name)')
supabase/functions/chat-assistant/index.ts:2587:            gast: (task as any).bookings?.guest_name,
supabase/functions/chat-assistant/index.ts:2598:          .select('id, delivery_date, status, booking_id, bookings(guest_name), houses(name)')
supabase/functions/chat-assistant/index.ts:2606:            gast: (order as any).bookings?.guest_name,
supabase/functions/chat-assistant/index.ts:2644:      .select('id, scheduled_date, status, booking_id, bookings(guest_name), houses(name)')
supabase/functions/chat-assistant/index.ts:2661:    const guestName = (task as any).bookings?.guest_name || 'Gast';
supabase/functions/chat-assistant/index.ts:2705:      guest_name: guestName,
supabase/functions/chat-assistant/index.ts:2769:      .select('id, delivery_date, status, booking_id, provider_id, bookings(guest_name), houses(name)')
supabase/functions/chat-assistant/index.ts:2786:    const guestName = (order as any).bookings?.guest_name || 'Gast';
supabase/functions/chat-assistant/index.ts:2822:      guest_name: guestName,
supabase/functions/chat-assistant/index.ts:2862: * Findet den Vorgang über action_id ODER guest_name. Bei guest_name werden nur
supabase/functions/chat-assistant/index.ts:2872:  if (!params?.action_id && !params?.guest_name) {
supabase/functions/chat-assistant/index.ts:2873:    return { success: false, error: 'action_id oder guest_name ist erforderlich' };
supabase/functions/chat-assistant/index.ts:2879:      .select('id, guest_name, status, action_type, waiting_for')
supabase/functions/chat-assistant/index.ts:2883:      : q.eq('guest_name', params.guest_name);
supabase/functions/chat-assistant/index.ts:2894:        error: `Mehrere offene Vorgänge zu ${params.guest_name} gefunden (${rows.length}). Bitte über action_id eindeutig angeben.`,
supabase/functions/chat-assistant/index.ts:2911:    // guest_name haben wir oben auf genau 1 Treffer eingegrenzt.
supabase/functions/chat-assistant/index.ts:2920:      gast: rows[0].guest_name,
supabase/functions/chat-assistant/index.ts:2924:          ? `Vorgang für ${rows[0].guest_name} abgeschlossen.`
supabase/functions/chat-assistant/index.ts:2925:          : `Frist für ${rows[0].guest_name} um 24 Stunden verlängert; der Vorgang wartet wieder auf eine Antwort.`,
supabase/functions/chat-assistant/index.ts:2966:        label: `Begrüßungs-E-Mail an ${d.guest_name || 'Gast'} öffnen`,
supabase/functions/chat-assistant/index.ts:2971:          guestName: d.guest_name,
supabase/functions/chat-assistant/index.ts:3039:          if (b?.id) add(b.id, 'booking', `Buchung ${b.guest_name || ''}`.trim());
supabase/functions/chat-assistant/index.ts:3052:          add(b.id, 'booking', `Buchung ${b.guest_name || fmtDate(b.check_in)}`.trim());
supabase/functions/chat-assistant/index.ts:3059:          const name = c.bookings?.guest_name || fmtDate(c.scheduled_date);
supabase/functions/chat-assistant/index.ts:3067:          const name = lo.bookings?.guest_name || fmtDate(lo.delivery_date);
supabase/functions/chat-assistant/index.ts:3076:          add(g.email || g.guest_email, 'guest', `${g.name || g.guest_name || 'Gast'}`.trim());
supabase/functions/chat-assistant/index.ts:3100:  guest_name?: string | null;
supabase/functions/chat-assistant/index.ts:3125:        guest_name: entry.guest_name ?? null,
supabase/functions/chat-assistant/index.ts:340:  const nachGast = typeof params.guest_name === 'string' && params.guest_name.trim() !== '';
supabase/functions/chat-assistant/index.ts:347:      bookings${nachGast ? '!inner' : ''}(guest_name, guest_email, guest_phone),
supabase/functions/chat-assistant/index.ts:355:    query = query.ilike('bookings.guest_name', `%${params.guest_name.trim()}%`);
supabase/functions/chat-assistant/index.ts:3613:- Listen von Wäschebestellungen → search_linen_orders (kann auch nach guest_name filtern)
supabase/functions/chat-assistant/index.ts:3653:  SOFORT und DIREKT mit guest_name auf — z.B. draft_guest_welcome_email({guest_name: "Hubert"}).
supabase/functions/chat-assistant/index.ts:3692:    auf (guest_name mitgeben). Behaupte NICHT, der Vorgang sei erledigt, ohne dieses Tool
supabase/functions/chat-assistant/index.ts:3735:- Brauchst du die task_id, suche sie selbst mit search_cleaning_tasks({guest_name}).
supabase/functions/chat-assistant/index.ts:3754:  search_linen_orders({guest_name}). Bei mehreren Treffern lege sie Uli zur Auswahl vor,
supabase/functions/chat-assistant/index.ts:425:    .select('guest_id, guest_name, guest_email, guest_phone, nationality, houses(name)')
supabase/functions/chat-assistant/index.ts:429:    query = query.ilike('guest_name', `%${params.name}%`);
supabase/functions/chat-assistant/index.ts:432:    query = query.ilike('guest_email', `%${params.email}%`);
supabase/functions/chat-assistant/index.ts:434:  if (params.nationality) {
supabase/functions/chat-assistant/index.ts:435:    query = query.ilike('nationality', `%${params.nationality}%`);
supabase/functions/chat-assistant/index.ts:446:  // Fix 11.08.2026: vorher Gruppierung per `guest_email || guest_name` — das
supabase/functions/chat-assistant/index.ts:448:  // guest_email leer war (guest_name als Fallback ist ein anderer String als
supabase/functions/chat-assistant/index.ts:454:    const key = b.guest_id || b.guest_email || b.guest_name;
supabase/functions/chat-assistant/index.ts:457:        guest_name: b.guest_name,
supabase/functions/chat-assistant/index.ts:458:        guest_email: b.guest_email,
supabase/functions/chat-assistant/index.ts:459:        guest_phone: b.guest_phone,
supabase/functions/chat-assistant/index.ts:460:        nationality: b.nationality,
supabase/functions/chat-assistant/index.ts:559:  const nachGast = typeof params.guest_name === 'string' && params.guest_name.trim() !== '';
supabase/functions/chat-assistant/index.ts:563:    .select(`*, houses(name), bookings${nachGast ? '!inner' : ''}(guest_name, check_in, check_out)`)
supabase/functions/chat-assistant/index.ts:568:    query = query.ilike('bookings.guest_name', `%${params.guest_name.trim()}%`);
supabase/functions/chat-assistant/index.ts:58:  if (params.guest_name) {
supabase/functions/chat-assistant/index.ts:598: * Nimmt guest_name ODER booking_id. Das Modell muss NICHT mehrstufig verketten.
supabase/functions/chat-assistant/index.ts:59:    query = query.ilike('guest_name', `%${params.guest_name}%`);
supabase/functions/chat-assistant/index.ts:611:  } else if (params.guest_name) {
supabase/functions/chat-assistant/index.ts:612:    bookingQuery = bookingQuery.ilike('guest_name', `%${params.guest_name}%`);
supabase/functions/chat-assistant/index.ts:614:    return { success: false, error: 'guest_name oder booking_id erforderlich' };
supabase/functions/chat-assistant/index.ts:683:        guest_name: b.guest_name,
supabase/functions/chat-assistant/index.ts:684:        guest_email: b.guest_email,
supabase/functions/chat-assistant/index.ts:807:      bookings(guest_name, guest_email),
supabase/functions/chat-assistant/index.ts:822:    .select('id, guest_name, check_in, number_of_guests, number_of_adults, number_of_children, houses(name)')
supabase/functions/chat-assistant/index.ts:835:    .select('id, guest_name, check_out, houses(name)')
supabase/functions/chat-assistant/index.ts:853:          departing_guest: co.guest_name,
supabase/functions/chat-assistant/index.ts:854:          arriving_guest: matchingCheckIn.guest_name,
supabase/functions/chat-assistant/index.ts:864:    .select('id, status, delivery_date, delivery_time, total_items, houses(name), bookings(guest_name)')
supabase/functions/chat-assistant/index.ts:984:    .select('id, guest_name, check_in, houses(name)')
supabase/functions/chat-assistant/index.ts:992:    .select('id, guest_name, check_out, houses(name)')
supabase/functions/check-booking-linen-orders/index.ts:11:  guest_name: string;
supabase/functions/check-booking-linen-orders/index.ts:171:        guest_name: (booking as any).guests?.name || booking.guest_name,
supabase/functions/check-booking-linen-orders/index.ts:61:      .select('id, guest_name, check_in, check_out, number_of_guests, house_id, houses!bookings_house_id_fkey(id, name), guests!bookings_guest_id_fkey(name)')
supabase/functions/create-cleaning-task-for-booking/index.ts:126:    const guestName = (booking as any).guests?.name || booking.guest_name;
supabase/functions/create-cleaning-task-for-booking/index.ts:65:        guest_name,
supabase/functions/create-linen-order-for-booking/index.ts:114:      guest_name: guestName,
supabase/functions/create-linen-order-for-booking/index.ts:35:        id, house_id, guest_name, number_of_guests, check_in,
supabase/functions/create-linen-order-for-booking/index.ts:42:    const guestName = (booking as any).guests?.name || booking.guest_name;
supabase/functions/generate-booking-linen-order/index.ts:251:        guest_name: (booking as any).guests?.name || booking.guest_name,
supabase/functions/generate-booking-linen-order/index.ts:29:        guest_name,
supabase/functions/generate-booking-linen-order/index.ts:49:    console.log('✅ Booking loaded:', { guest: booking.guest_name, guests: booking.number_of_guests });
supabase/functions/generate-guest-profile/index.ts:100:        onConflict: 'guest_email,booking_id'
supabase/functions/generate-guest-profile/index.ts:168:    nationality: guestData.nationality || 'DE',
supabase/functions/generate-guest-profile/index.ts:17:  guest_name: string;
supabase/functions/generate-guest-profile/index.ts:18:  guest_email: string;
supabase/functions/generate-guest-profile/index.ts:19:  nationality: string;
supabase/functions/generate-guest-profile/index.ts:59:        .eq('guest_email', booking.guest_email)
supabase/functions/generate-guest-profile/index.ts:84:      email: booking.guests?.email || booking.guest_email,
supabase/functions/generate-guest-profile/index.ts:85:      name: booking.guests?.name || booking.guest_name,
supabase/functions/generate-guest-profile/index.ts:86:      nationality: booking.guests?.nationality || booking.nationality,
supabase/functions/generate-guest-profile/index.ts:95:        guest_email: guestData.email,
supabase/functions/generate-personalized-email/index.ts:273:- ${guest?.guest_name ?? 'Gast'}: ${bookingsCount} Buchung(en), €${guest?.total_revenue ?? 0} Gesamtumsatz, Bevorzugte Saison: ${seasons}, Loyalitätslevel: ${guest?.loyalty_level ?? '—'}
supabase/functions/generate-personalized-email/index.ts:69:    const guestName = sampleGuests?.[0]?.guest_name || '';
supabase/functions/ical-sync/index.ts:188:        .select('id, guest_name, check_in, check_out, status, platform, guests!bookings_guest_id_fkey(name)')
supabase/functions/ical-sync/index.ts:239:              eigene_buchung: ((collision as any)?.guests?.name || collision?.guest_name),
supabase/functions/ical-sync/index.ts:286:            eigene_buchung: ((collision as any)?.guests?.name || collision?.guest_name),
supabase/functions/import-guest-list/index.ts:125:          guest_name: booking.guestName,
supabase/functions/import-guest-list/index.ts:131:          nationality: booking.nationality || null,
supabase/functions/import-guest-list/index.ts:132:          guest_street: booking.guestStreet || null,
supabase/functions/import-guest-list/index.ts:133:          guest_city: booking.guestCity || null,
supabase/functions/import-guest-list/index.ts:134:          guest_postal_code: booking.guestPostalCode || null,
supabase/functions/import-guest-list/index.ts:135:          guest_birth_date: booking.guestBirthDate || null,
supabase/functions/import-guest-list/index.ts:136:          guest_travel_document: booking.guestTravelDocument || null,
supabase/functions/import-guest-list/index.ts:18:  nationality: string;
supabase/functions/kalender-abgleich/index.ts:291:        .select('id, guest_name, check_in, check_out, guests!bookings_guest_id_fkey(name)')
supabase/functions/kalender-abgleich/index.ts:306:          belegtVon.set(t, (b as any).guests?.name ?? b.guest_name ?? 'Buchung');
supabase/functions/kalender-abgleich/index.ts:432:        .select('id, guest_name, check_in, check_out, status, platform, house_id, updated_at, portale_geprueft_am, houses(name), guests!bookings_guest_id_fkey(name)')
supabase/functions/kalender-abgleich/index.ts:471:            ? `Direktbuchung „${(b as any).guests?.name || b.guest_name}" (${zeitraum}) wurde storniert — bitte in Airbnb, Booking.com und VRBO prüfen, ob der Zeitraum wieder freigegeben ist, und in der Buchungskarte abhaken.`
supabase/functions/kalender-abgleich/index.ts:472:            : `Direktbuchung „${(b as any).guests?.name || b.guest_name}" (${zeitraum}) — bitte in Airbnb, Booking.com und VRBO prüfen, ob der Zeitraum geblockt ist, und in der Buchungskarte abhaken.`,
supabase/functions/max-cleaning-reminders/index.ts:179:      const guestName = hasBooking ? (booking?.guest_name || 'den nächsten Gast') : null;
supabase/functions/max-cleaning-reminders/index.ts:242:              guest_name: guestName, // null bei Reinigung ohne Buchung
supabase/functions/max-cleaning-reminders/index.ts:92:        bookings(guest_name, check_in, check_out, status)
supabase/functions/max-linen-reminders/index.ts:171:          gast: booking?.guest_name || null,
supabase/functions/max-linen-reminders/index.ts:195:      const guestName = booking?.guest_name || 'den nächsten Gast';
supabase/functions/max-linen-reminders/index.ts:242:              guest_name: guestName,
supabase/functions/max-linen-reminders/index.ts:83:        bookings(guest_name, check_in, check_out, status)
supabase/functions/morning-summary/index.ts:202:          id, guest_name, guest_email, guests!bookings_guest_id_fkey(name, email),
supabase/functions/morning-summary/index.ts:242:          id, guest_name, guests!bookings_guest_id_fkey(name),
supabase/functions/morning-summary/index.ts:311:        .select('*, houses!service_tasks_house_id_fkey(name), bookings!service_tasks_booking_id_fkey(guest_name)')
supabase/functions/morning-summary/index.ts:327:        .select('*, houses!linen_orders_house_id_fkey(name), bookings!linen_orders_booking_id_fkey(guest_name, check_in)')
supabase/functions/morning-summary/index.ts:341:        .select('id, action_type, guest_name, waiting_for, due_at, last_step')
supabase/functions/morning-summary/index.ts:479:        const gast = a.guest_name || 'Buchung';
supabase/functions/morning-summary/index.ts:506:        const email = b.guest_email ? ` (${b.guest_email})` : '';
supabase/functions/morning-summary/index.ts:509:        message += `• **${(b as any).guests?.name || b.guest_name}**${email} → ${houseName} - Check-in in ${daysUntil} Tagen (${checkInDate})${familyTag}\n`;
supabase/functions/morning-summary/index.ts:537:          message += `• **${(b as any).guests?.name || b.guest_name}** (${platform}) - ${houseName}\n`;
supabase/functions/morning-summary/index.ts:551:          message += `• ${(b as any).guests?.name || b.guest_name} (${platform}) - Checkout vor ${daysSince} Tagen (${checkOutDate})\n`;
supabase/functions/morning-summary/index.ts:568:        const guestName = o.bookings?.guest_name || 'Kein Gast';
supabase/functions/morning-summary/index.ts:584:        message += `• ${checkInDate} ${checkInTime} - ${b.guest_name} (${houseName}) - ${daysText}\n`;
supabase/functions/morning-summary/index.ts:659:                recipients: [{ email: emailTo, guest_name: 'Uli' }],
supabase/functions/morning-summary/index.ts:93:    nationality?: string;
supabase/functions/overdue-watch/index.ts:115:          console.log(`⚠️ [overdue-watch] ${a.guest_name}: ${hinweis}`);
supabase/functions/overdue-watch/index.ts:61:      .select('id, action_type, status, guest_name, waiting_for, due_at, last_step, related_task_id, booking_id')
supabase/functions/overdue-watch/index.ts:87:        gast: a.guest_name,
supabase/functions/send-guest-email/index.ts:15:    .replace(/\{guest_name\}/gi, data.guestName ?? 'Gast')
supabase/functions/sync-linen-order-rest/index.ts:58:      .select(`*, houses!linen_orders_house_id_fkey(id,name,external_objektnummer), bookings!linen_orders_booking_id_fkey(id,guest_name,check_in,check_out,number_of_guests)`)
supabase/functions/sync-linen-order-rest/index.ts:94:      gastname: booking?.guest_name || 'Unbekannt',
