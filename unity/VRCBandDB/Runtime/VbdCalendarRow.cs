using UdonSharp;
using UnityEngine;
namespace SerieIndustry.VRCBandDB {
[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class VbdCalendarRow : UdonSharpBehaviour {
    public VbdEventCalendar calendar;
    public int slot;
    public void Press() { if (calendar != null) { calendar.selectedSlot = slot; calendar.OpenSelectedEvent(); } }
}
}
