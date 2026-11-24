#if UNITY_EDITOR
using System;
using UnityEngine;
namespace SerieIndustry.VRCBandDB.Editor {
public static class VbdCalendarEditorTests {
    public static int Run(VbdEventCalendar calendar) {
        int count=0;DateTime parsed;
        Require(calendar.ParseIso("2026-11-24T20:00:00+09:00",out parsed)&&parsed.Hour==11,"JST offset");count++;
        Require(calendar.ParseIso("2026-11-24T11:00:00.000Z",out parsed)&&parsed.Hour==11,"UTC fractional");count++;
        Require(!calendar.ParseIso("2026-02-30T11:00:00Z",out parsed),"invalid date");count++;
        calendar.useSampleData=true;calendar.Refresh();Require(calendar.lastParseSucceeded&&calendar.eventCount==5,"sample CSV/quotes/newline");count++;
        Require(calendar.visibleCount==1,"VRChat only today");count++;
        Require(!calendar.detailText.text.Contains("Cluster"),"other platforms excluded");count++;
        calendar.selectedSlot=0;calendar.OpenSelectedEvent();Require(calendar.detailText.text.Contains("サンプルバンドA"),"selection details");count++;
        Require(calendar.detailTitleText!=null&&calendar.detailTitleText.text.Contains("サンプルライブ")&&!calendar.detailText.text.Contains("形態："),"separate title / no redundant platform");count++;
        int old=calendar.eventCount;
        Require(!calendar.ImportCsv("bad,column\nx,y")&&calendar.eventCount==old,"keep data after invalid CSV");count++;
        string header="eventId,title,place,startsAt,endsAt,participants\n";
        Require(!calendar.ImportCsv(header+"x,a,VRChat,2026-01-01T00:00:00Z,2026-01-01T01:00:00Z,[]\nx,b,VRChat,2026-01-01T00:00:00Z,2026-01-01T01:00:00Z,[]")&&calendar.eventCount==old,"duplicate IDs");count++;
        Require(calendar.ImportCsv(header)&&calendar.eventCount==0,"empty feed");count++;
        calendar.useSampleData=true;calendar.Refresh();calendar.bandId="band-demo-b";calendar.Render();Require(calendar.visibleCount==1,"participant band filter");count++;
        calendar.bandId="not-found";calendar.Render();Require(calendar.visibleCount==0,"unmatched band filter");count++;
        calendar.bandId="";
        string now=DateTime.UtcNow.AddMinutes(-10).ToString("yyyy-MM-ddTHH:mm:ssZ");
        string ended=DateTime.UtcNow.AddMinutes(-5).ToString("yyyy-MM-ddTHH:mm:ssZ");
        Require(calendar.ImportCsv(header+"ended,Ended,VRChat,"+now+","+ended+",[]")&&calendar.visibleCount==0,"ended VRChat excluded");count++;
        calendar.Refresh();string before=calendar.dateText.text;calendar.NextDay();string after=calendar.dateText.text;
        calendar.NextDay();calendar.PreviousDay();Require(before!=after&&calendar.dateText.text==after,"duplicate date Down ignored");count++;
        return count;
    }
    private static void Require(bool condition,string name) { if(!condition)throw new Exception("Calendar test failed: "+name); }
}
}
#endif


