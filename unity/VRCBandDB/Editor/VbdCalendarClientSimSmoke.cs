#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UdonSharpEditor;
using VRC.Udon;

namespace SerieIndustry.VRCBandDB.Editor {
// An explicitly requested test only. Creates no edit-mode Scene objects and never saves user Scenes.
[InitializeOnLoad]
public static class VbdCalendarClientSimSmoke {
    private const string Request="Library/VRCBandDBCalendar-smoke.request", Result="Library/VRCBandDBCalendar-smoke-result.json", Active="VRCBandDBCalendarSmokeActive";
    private static GameObject root;
    private static UdonBehaviour main;
    private static double at;
    private static int phase, checks;
    private static string today, tomorrow;
    static VbdCalendarClientSimSmoke() {
        EditorApplication.playModeStateChanged += Changed;
        EditorApplication.update += Tick;
    }
    private static void Changed(PlayModeStateChange state) {
        if(state==PlayModeStateChange.EnteredPlayMode && File.Exists(Request)) {File.Delete(Request);SessionState.SetBool(Active,true);at=EditorApplication.timeSinceStartup;phase=0;checks=0;}
        if(state==PlayModeStateChange.ExitingPlayMode)SessionState.SetBool(Active,false);
    }
    private static void Tick() {
        if(!EditorApplication.isPlaying||!SessionState.GetBool(Active,false))return;
        try {
            if(phase==0 && EditorApplication.timeSinceStartup-at>3) {
                string[] guids=AssetDatabase.FindAssets("VbdEventCalendar t:MonoScript");string path="";
                foreach(string guid in guids){string p=AssetDatabase.GUIDToAssetPath(guid);if(p.EndsWith("/Runtime/VbdEventCalendar.cs"))path=p.Substring(0,p.Length-"/Runtime/VbdEventCalendar.cs".Length)+"/Prefabs/VRCBandDB Calendar.prefab";}
                var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(prefab==null)throw new Exception("Missing calendar prefab.");
                root=UnityEngine.Object.Instantiate(prefab);root.name="VRCBandDB Smoke Instance";root.transform.position=new Vector3(0,1.5f,3);
                main=root.GetComponent<UdonBehaviour>();
                foreach(var behaviour in root.GetComponentsInChildren<UdonBehaviour>(true)) if(!behaviour.IsInitialized) behaviour.InitializeUdonContent();
                main.SetProgramVariable("useSampleData",true);main.SendCustomEvent("Refresh");
                phase=1;at=EditorApplication.timeSinceStartup;
            }
            if(phase==1 && EditorApplication.timeSinceStartup-at>3) {
                Require((int)main.GetProgramVariable("eventCount")==5,"Udon sample CSV parsing");
                Require((int)main.GetProgramVariable("visibleCount")==1,"VRChat only local date filtering");
                Require(root.layer==0&&root.GetComponent<Canvas>().renderMode==RenderMode.WorldSpace,"world UI layer");
                Require(root.transform.Find("Filter0")==null&&root.transform.Find("Ended")==null,"no platform or ended controls");
                Press("Event0");Require(root.transform.Find("Details/Viewport/Content").GetComponent<Text>().text.Contains("サンプルバンドA"),"PointerDown row details");
                Require(root.transform.Find("DetailHeading/Title").GetComponent<Text>().text.Contains("サンプルライブ")&&!root.transform.Find("Details/Viewport/Content").GetComponent<Text>().text.Contains("形態："),"distinct title / no platform label");
                Require(root.transform.Find("Event0").GetComponent<Button>().onClick.GetPersistentEventCount()==0,"no duplicate onClick callback");
                phase=2;at=EditorApplication.timeSinceStartup;
            }
            if(phase==2&&EditorApplication.timeSinceStartup-at>.25) {
                var button=root.transform.Find("Event0").GetComponent<Button>();
                Color tint=button.targetGraphic.canvasRenderer.GetColor();
                Require(tint.g<.95f,"pressed visual feedback");
                ExecuteEvents.Execute(button.gameObject,new PointerEventData(EventSystem.current){button=PointerEventData.InputButton.Left},ExecuteEvents.pointerUpHandler);
                today=root.transform.Find("Date").GetComponent<Text>().text;
                Press("NextDay");tomorrow=root.transform.Find("Date").GetComponent<Text>().text;
                string expected=DateTime.UtcNow.AddHours(9).Date.AddDays(1).ToString("yyyy/MM/dd");
                Require(tomorrow.StartsWith(expected),"next date exactly one day");
                Require((int)main.GetProgramVariable("visibleCount")==2,"VRChat overnight and tomorrow events");
                Press("NextDay");Require(root.transform.Find("Date").GetComponent<Text>().text==tomorrow,"same frame repeated Down ignored");
                phase=3;at=EditorApplication.timeSinceStartup;
            }
            if(phase==3&&EditorApplication.timeSinceStartup-at>.5) {
                Press("NextDay");Require(root.transform.Find("Date").GetComponent<Text>().text==tomorrow,"held Down across frames ignored");
                Release("NextDay");Press("PreviousDay");
                Require(root.transform.Find("Date").GetComponent<Text>().text==today,"release permits next separate press");
                Press("PreviousDay");Require(root.transform.Find("Date").GetComponent<Text>().text==today,"duplicate previous Down ignored");
                Release("PreviousDay");phase=4;at=EditorApplication.timeSinceStartup;
            }
            if(phase==4&&EditorApplication.timeSinceStartup-at>.2) {
                Press("PreviousDay");
                Require(root.transform.Find("Date").GetComponent<Text>().text.StartsWith(DateTime.UtcNow.AddHours(9).Date.AddDays(-1).ToString("yyyy/MM/dd")),"previous date exactly one day");
                Require((int)main.GetProgramVariable("visibleCount")==0,"ended events excluded");
                Release("PreviousDay");
                bool clientSim=false;foreach(var behaviour in UnityEngine.Object.FindObjectsOfType<MonoBehaviour>())if(behaviour!=null&&(behaviour.GetType().Namespace??"").Contains("ClientSim")){clientSim=true;break;}
                Require(clientSim,"ClientSim running");
                Finish(true,"VRChat only; no ended controls; PointerDown/Up; duplicate and held date input; row details and feedback passed.",checks);
            }
            if(EditorApplication.timeSinceStartup-at>30)throw new Exception("Calendar runtime test timed out.");
        } catch(Exception error) {Finish(false,error.ToString(),0);}
    }
    private static void Press(string name) {
        var target=root.transform.Find(name).gameObject;
        ExecuteEvents.Execute(target,new PointerEventData(EventSystem.current){button=PointerEventData.InputButton.Left},ExecuteEvents.pointerDownHandler);
    }
    private static void Release(string name) {
        ExecuteEvents.Execute(root.transform.Find(name).gameObject,new PointerEventData(EventSystem.current){button=PointerEventData.InputButton.Left},ExecuteEvents.pointerUpHandler);
    }
    private static void Require(bool value,string label){if(!value)throw new Exception("Smoke test failed: "+label);checks++;}
    private static void Finish(bool ok,string message,int tests) {SessionState.SetBool(Active,false);File.WriteAllText(Result,JsonUtility.ToJson(new Report{ok=ok,message=message,tests=tests},true));Debug.Log("[VRCBandDB Calendar] ClientSim test: "+ok+" "+message);}
    [Serializable]private class Report{public bool ok;public string message;public int tests;}
}
}
#endif



