export function EventPicker({ events, selectedEventId, setSelectedEventId, label = "Event" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={selectedEventId}
        onChange={(event) => setSelectedEventId(Number(event.target.value))}
      >
        <option value="">Select event</option>
        {events.map((eventItem) => (
          <option key={eventItem.id} value={eventItem.id}>
            #{eventItem.id} {eventItem.home_team} vs {eventItem.away_team} ({eventItem.sport})
          </option>
        ))}
      </select>
    </label>
  );
}
