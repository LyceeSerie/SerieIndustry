using System;
using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDK3.Data;
using VRC.SDK3.StringLoading;
using VRC.SDKBase;

namespace SerieIndustry.VRCBandDB {
[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class VbdEventCalendar : UdonSharpBehaviour {
    [Header("公開イベントシート（読み取り専用）")]
    public VRCUrl dataUrl = new VRCUrl("https://docs.google.com/spreadsheets/d/1MSWnv5mYUI9cxhnnm7hq6i214zbpW7Ad8rky6s10hXo/gviz/tq?tqx=out:csv&headers=1&gid=0");
    [Tooltip("VRChat側の文字列取得制限に合わせて最低30秒。既定5分。")]
    public float refreshSeconds = 300f;
    public bool useSampleData;
    public TextAsset sampleCsv;
    [Tooltip("空なら全バンド。設定すると主催・参加バンドIDが一致するものだけ表示します。")]
    public string bandId = "";
    public Text dateText, statusText, pageText, detailText, detailTitleText;
    public GameObject[] rowObjects;
    public Text[] rowTexts;
    public Button[] rowButtons;
    [HideInInspector] public int selectedSlot;
    [HideInInspector] public int eventCount;
    [HideInInspector] public int visibleCount;
    [HideInInspector] public bool lastParseSucceeded;
    private const int MaxEvents = 512;
    private string[] ids = new string[MaxEvents], titles = new string[MaxEvents], subtitles = new string[MaxEvents];
    private string[] places = new string[MaxEvents], venues = new string[MaxEvents], venueUrls = new string[MaxEvents];
    private string[] participants = new string[MaxEvents], owners = new string[MaxEvents];
    private DateTime[] starts = new DateTime[MaxEvents], ends = new DateTime[MaxEvents];
    private int[] visible = new int[MaxEvents];
    private DateTime selectedDay;
    private int selectedEvent = -1, page;
    private bool loading, initialized, datePointerHeld;
    private int lastDateInputFrame = -1;
    private float lastRequest = -10000f, lastClock;

    private void Start() {
        selectedDay = DateTime.UtcNow.AddHours(9).Date;
        initialized = true;
        Debug.Log("[VRCBandDB Calendar] Start");
        Refresh();
    }
    private void Update() {
        if (!initialized) return;
        if (Time.time - lastClock >= 30f) { lastClock = Time.time; Render(); }
        if (!useSampleData && !loading && Time.time - lastRequest >= Mathf.Max(30f, refreshSeconds)) Refresh();
    }
    public void Refresh() {
        if (!initialized) { selectedDay = DateTime.UtcNow.AddHours(9).Date; initialized = true; }
        if (useSampleData) {
            if (sampleCsv == null) { SetStatus("サンプルCSVが未設定です。"); return; }
            DateTime sampleDay = DateTime.UtcNow.AddHours(9).Date;
            string today = sampleDay.ToString("yyyy-MM-dd");
            string csv = sampleCsv.text.Replace("{{TODAY}}", today).Replace("{{TOMORROW}}", sampleDay.AddDays(1).ToString("yyyy-MM-dd")).Replace("{{YESTERDAY}}", sampleDay.AddDays(-1).ToString("yyyy-MM-dd"));
            ImportCsv(csv); return;
        }
        if (loading || Time.time - lastRequest < 5.1f) return;
        if (dataUrl == null || string.IsNullOrEmpty(dataUrl.Get())) { SetStatus("データURLが未設定です。"); return; }
        loading = true; lastRequest = Time.time; SetStatus("イベント情報を取得中…");
        VRCStringDownloader.LoadUrl(dataUrl, this);
    }
    public override void OnStringLoadSuccess(IVRCStringDownload result) {
        if (result.Url.Get() != dataUrl.Get()) return;
        loading = false; ImportCsv(result.Result);
    }
    public override void OnStringLoadError(IVRCStringDownload result) {
        loading = false;
        SetStatus("取得できませんでした（HTTP " + result.ErrorCode + "）。Allow Untrusted URLs・URL設定をご確認ください。前回データは維持します。");
    }
    private void SetStatus(string message) { if (statusText != null) statusText.text = message; }
    // A VR pointer may deliver repeated Down events during one press. Only Up rearms navigation.
    private bool BeginDateInput(string action) {
        Debug.Log("[VRCBandDB Calendar] PointerDown: " + action);
        if (datePointerHeld || lastDateInputFrame == Time.frameCount) return false;
        datePointerHeld = true; lastDateInputFrame = Time.frameCount;
        return true;
    }
    public void ReleaseDateInput() { datePointerHeld = false; }
    private void OnDisable() { datePointerHeld = false; }
    public void PreviousDay() { if (!BeginDateInput("PreviousDay")) return; selectedDay = selectedDay.AddDays(-1); page = 0; selectedEvent = -1; Render(); }
    public void NextDay() { if (!BeginDateInput("NextDay")) return; selectedDay = selectedDay.AddDays(1); page = 0; selectedEvent = -1; Render(); }
    public void Today() { if (!BeginDateInput("Today")) return; selectedDay = DateTime.UtcNow.AddHours(9).Date; page = 0; selectedEvent = -1; Render(); }
    public void PreviousPage() { if (page > 0) page--; Render(); }
    public void NextPage() { int size = RowCount(); if ((page + 1) * size < visibleCount) page++; Render(); }
    public void OpenSelectedEvent() {
        int at = page * RowCount() + selectedSlot;
        if (selectedSlot < 0 || selectedSlot >= RowCount() || at < 0 || at >= visibleCount) return;
        selectedEvent = visible[at]; DrawDetails();
        Debug.Log("[VRCBandDB Calendar] PointerDown: event selected");
    }
    private int RowCount() { return rowObjects == null || rowObjects.Length == 0 ? 8 : rowObjects.Length; }
    public void Render() {
        if (selectedDay.Year < 1900) selectedDay = DateTime.UtcNow.AddHours(9).Date;
        DateTime utcNow = DateTime.UtcNow;
        DateTime dayStart = selectedDay.AddHours(-9), dayEnd = dayStart.AddDays(1);
        visibleCount = 0;
        for (int i = 0; i < eventCount; i++) {
            if (starts[i] >= dayEnd || ends[i] <= dayStart || ends[i] <= utcNow) continue;
            if (places[i] != "VRChat") continue;
            if (!MatchesBand(i)) continue;
            int pos = visibleCount;
            while (pos > 0 && starts[visible[pos - 1]] > starts[i]) { visible[pos] = visible[pos - 1]; pos--; }
            visible[pos] = i; visibleCount++;
        }
        int size = RowCount(), pages = Mathf.Max(1, (visibleCount + size - 1) / size);
        page = Mathf.Clamp(page, 0, pages - 1);
        if (dateText != null) dateText.text = selectedDay.ToString("yyyy/MM/dd") + "（日本時間）";
        if (pageText != null) pageText.text = (page + 1) + " / " + pages + "　" + visibleCount + "件";
        if (rowObjects != null) for (int slot = 0; slot < rowObjects.Length; slot++) {
            int index = page * size + slot; bool show = index < visibleCount;
            if (rowObjects[slot] != null) rowObjects[slot].SetActive(show);
            if (!show) continue;
            int e = visible[index];
            if (rowTexts != null && slot < rowTexts.Length && rowTexts[slot] != null) rowTexts[slot].text = starts[e].AddHours(9).ToString("HH:mm") + " - " + ends[e].AddHours(9).ToString("HH:mm") + "  [" + places[e] + "]\n" + titles[e];
        }
        if (selectedEvent >= 0 && selectedEvent < eventCount) {
            bool stillVisible = false; for (int i = 0; i < visibleCount; i++) if (visible[i] == selectedEvent) stillVisible = true;
            if (!stillVisible) selectedEvent = -1;
        }
        DrawDetails();
    }
    private bool MatchesBand(int index) {
        if (string.IsNullOrEmpty(bandId) || owners[index] == bandId) return true;
        DataToken token;
        if (!VRCJson.TryDeserializeFromJson(participants[index], out token) || token.TokenType != TokenType.DataList) return false;
        DataList list = token.DataList;
        for (int i = 0; i < list.Count; i++) { DataToken id; if (list[i].TokenType == TokenType.DataDictionary && list[i].DataDictionary.TryGetValue("bandId", TokenType.String, out id) && id.String == bandId) return true; }
        return false;
    }
    private void DrawDetails() {
        if (detailText == null) return;
        if (detailTitleText != null) detailTitleText.text = selectedEvent < 0 || selectedEvent >= eventCount ? "イベント詳細" : titles[selectedEvent];
        if (selectedEvent < 0 || selectedEvent >= eventCount) { detailText.text = visibleCount == 0 ? "この日の開催前・開催中のVRChatイベントはありません。\n別の日付をご確認ください。" : "左のイベントを選択してください。"; return; }
        int i = selectedEvent;
        detailText.text = "【日時・日本時間】\n" + starts[i].AddHours(9).ToString("yyyy/MM/dd HH:mm") + " ～\n" + ends[i].AddHours(9).ToString("yyyy/MM/dd HH:mm") + "\n\n【場所】\n" + (string.IsNullOrEmpty(venues[i]) ? "未入力" : venues[i]) + (string.IsNullOrEmpty(venueUrls[i]) ? "" : "\n" + venueUrls[i]) + "\n\n【参加バンド】\n" + ParticipantNames(participants[i]) + (string.IsNullOrEmpty(subtitles[i]) ? "" : "\n\n【概要】\n" + subtitles[i]);
    }
    private string ParticipantNames(string json) {
        DataToken token; if (!VRCJson.TryDeserializeFromJson(json, out token) || token.TokenType != TokenType.DataList) return "未入力";
        DataList list = token.DataList; string output = "";
        for (int i = 0; i < list.Count; i++) { DataToken name; if (list[i].TokenType == TokenType.DataDictionary && list[i].DataDictionary.TryGetValue("name", TokenType.String, out name)) output += (output == "" ? "" : "\n") + name.String; }
        return output == "" ? "未入力" : output;
    }
    public bool ImportCsv(string csv) {
        lastParseSucceeded = false;
        if (string.IsNullOrEmpty(csv) || csv.Length > 2000000) { SetStatus("CSVが空、または大きすぎます。前回データを維持します。"); return false; }
        DataList table = ParseCsv(csv);
        if (table == null || table.Count < 1) { SetStatus("CSVを読み込めません。前回データを維持します。"); return false; }
        DataList header = table[0].DataList;
        int idCol = Column(header, "eventId"), titleCol = Column(header, "title"), placeCol = Column(header, "place"), startCol = Column(header, "startsAt"), endCol = Column(header, "endsAt"), peopleCol = Column(header, "participants");
        if (idCol < 0 || titleCol < 0 || placeCol < 0 || startCol < 0 || endCol < 0 || peopleCol < 0) { SetStatus("イベントシートの列が一致しません。前回データを維持します。"); return false; }
        if (table.Count > MaxEvents + 1) { SetStatus("イベントが512件を超えています。前回データを維持します。"); return false; }
        // Validate all rows before replacing the current display.
        for (int i = 1; i < table.Count; i++) {
            DataList row = table[i].DataList; DateTime start, end; DataToken people;
            string id = Cell(row, idCol), title = Cell(row, titleCol), place = Cell(row, placeCol);
            if (id == "" || title == "" || (place != "VRChat" && place != "Cluster" && place != "リアル" && place != "その他") || !ParseIso(Cell(row, startCol), out start) || !ParseIso(Cell(row, endCol), out end) || end <= start || !VRCJson.TryDeserializeFromJson(Cell(row, peopleCol), out people) || people.TokenType != TokenType.DataList) { SetStatus("不正なイベント行があります。前回データを維持します。"); return false; }
            for (int j = 1; j < i; j++) if (Cell(table[j].DataList, idCol) == id) { SetStatus("イベントIDが重複しています。前回データを維持します。"); return false; }
        }
        int subtitleCol = Column(header, "subtitle"), venueCol = Column(header, "venueName"), urlCol = Column(header, "venueUrl"), ownerCol = Column(header, "ownerBandId");
        eventCount = table.Count - 1; selectedEvent = -1;
        for (int i = 0; i < eventCount; i++) {
            DataList row = table[i + 1].DataList;
            ids[i] = Cell(row, idCol); titles[i] = Cell(row, titleCol); places[i] = Cell(row, placeCol);
            subtitles[i] = Cell(row, subtitleCol); venues[i] = Cell(row, venueCol); venueUrls[i] = Cell(row, urlCol); owners[i] = Cell(row, ownerCol); participants[i] = Cell(row, peopleCol);
            DateTime a, b; ParseIso(Cell(row, startCol), out a); ParseIso(Cell(row, endCol), out b); starts[i] = a; ends[i] = b;
        }
        lastParseSucceeded = true; SetStatus((useSampleData ? "サンプル / " : "") + "取得：" + DateTime.UtcNow.AddHours(9).ToString("HH:mm:ss") + "　全" + eventCount + "件"); Render(); return true;
    }
    private int Column(DataList header, string name) { int found = -1; for (int i = 0; i < header.Count; i++) if (header[i].String.Trim().TrimStart('\uFEFF') == name) { if (found >= 0) return -1; found = i; } return found; }
    private string Cell(DataList row, int index) { return index < 0 || index >= row.Count ? "" : row[index].String.Trim(); }
    private DataList ParseCsv(string csv) {
        DataList rows = new DataList(), row = new DataList(); string value = ""; bool quoted = false, closed = false;
        for (int i = 0; i < csv.Length; i++) {
            char c = csv[i]; if (i == 0 && c == '\uFEFF') continue;
            if (quoted) { if (c == '"') { if (i + 1 < csv.Length && csv[i + 1] == '"') { value += "\""; i++; } else { quoted = false; closed = true; } } else value += c; continue; }
            if (c == '"') { if (value != "" || closed) return null; quoted = true; }
            else if (c == ',' || c == '\n' || c == '\r') { row.Add(value); value = ""; closed = false; if (c != ',') { if (!EmptyRow(row)) rows.Add(row); row = new DataList(); if (c == '\r' && i + 1 < csv.Length && csv[i + 1] == '\n') i++; if (rows.Count > MaxEvents + 1) return null; } }
            else { if (closed) return null; value += c; }
        }
        if (quoted) return null;
        if (value != "" || row.Count > 0 || closed) { row.Add(value); if (!EmptyRow(row)) rows.Add(row); }
        return rows;
    }
    private bool EmptyRow(DataList row) { for (int i = 0; i < row.Count; i++) if (row[i].String.Trim() != "") return false; return true; }
    public bool ParseIso(string value, out DateTime result) {
        result = new DateTime();
        if (string.IsNullOrEmpty(value) || value.Length < 20 || value[4] != '-' || value[7] != '-' || value[10] != 'T' || value[13] != ':' || value[16] != ':') return false;
        int year = Number(value, 0, 4), month = Number(value, 5, 2), day = Number(value, 8, 2), hour = Number(value, 11, 2), minute = Number(value, 14, 2), second = Number(value, 17, 2);
        if (year < 1900 || year > 9998 || month < 1 || month > 12 || day < 1 || day > DateTime.DaysInMonth(year, month) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
        int at = 19; if (at < value.Length && value[at] == '.') { at++; int begin = at; while (at < value.Length && value[at] >= '0' && value[at] <= '9') at++; if (at == begin) return false; }
        int offset = 0;
        if (at == value.Length - 1 && value[at] == 'Z') { }
        else if (at + 6 == value.Length && (value[at] == '+' || value[at] == '-') && value[at + 3] == ':') { int h = Number(value, at + 1, 2), m = Number(value, at + 4, 2); if (h < 0 || h > 14 || m < 0 || m > 59 || (h == 14 && m != 0)) return false; offset = (h * 60 + m) * (value[at] == '+' ? 1 : -1); }
        else return false;
        result = new DateTime(year, month, day, hour, minute, second).AddMinutes(-offset); return true;
    }
    private int Number(string value, int at, int count) { int number = 0; for (int i = at; i < at + count; i++) { char c = value[i]; if (c < '0' || c > '9') return -1; number = number * 10 + c - '0'; } return number; }
}
}
