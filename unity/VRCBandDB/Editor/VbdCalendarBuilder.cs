#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using UdonSharp;
using UdonSharpEditor;
using VRC.Udon;
using SerieIndustry.VRCBandDB;

namespace SerieIndustry.VRCBandDB.Editor {
[InitializeOnLoad]
public static class VbdCalendarBuilder {
    private static readonly Color Background = new Color(0.94f,0.95f,0.92f);
    private static readonly Color Primary = new Color(0.16f,0.32f,0.24f);
    private static readonly Color Ink = new Color(0.12f,0.18f,0.15f);
    private static Font font;
    private static double nextPoll;
    private static bool building;
    static VbdCalendarBuilder() { EditorApplication.delayCall += ProcessRequest; EditorApplication.update += PollRequest; }
    private static void PollRequest() { if (EditorApplication.timeSinceStartup < nextPoll) return; nextPoll = EditorApplication.timeSinceStartup + 2; ProcessRequest(); }
    private static string Root() {
        string[] guids = AssetDatabase.FindAssets("VbdEventCalendar t:MonoScript");
        foreach (string guid in guids) { string path = AssetDatabase.GUIDToAssetPath(guid); if (path.EndsWith("/Runtime/VbdEventCalendar.cs")) return path.Substring(0,path.Length-"/Runtime/VbdEventCalendar.cs".Length); }
        throw new Exception("VbdEventCalendar.cs was not found.");
    }
    private static void ProcessRequest() {
        if (building || EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling || EditorApplication.isUpdating) return;
        string root;
        try { root = Root(); } catch { return; }
        string request = root + "/Editor/BuildCalendar.request";
        if (!File.Exists(request)) return;
        File.Delete(request);
        building=true;
        try { CreatePrefab(); } catch (Exception error) { File.WriteAllText("Library/VRCBandDBCalendar-build-result.json", JsonUtility.ToJson(new Report { ok=false, message=error.ToString() },true)); Debug.LogException(error); } finally { building=false; }
    }
    [MenuItem("Tools/SerieIndustry/VRC Band DB/Build Calendar Prefab")]
    public static void CreatePrefab() {
        if (EditorApplication.isPlayingOrWillChangePlaymode) throw new Exception("Build the asset in Edit Mode.");
        string sourceRoot = Root();
        string root = sourceRoot.StartsWith("Packages/") ? "Assets/SerieIndustry/VRCBandDBGenerated" : sourceRoot;
        string assemblyPath=sourceRoot+"/Runtime/SerieIndustry.VRCBandDB.Udon.asset";
        if(AssetDatabase.LoadAssetAtPath<UdonSharpAssemblyDefinition>(assemblyPath)==null) {
            if(sourceRoot.StartsWith("Packages/"))throw new Exception("Missing distributed Udon assembly definition.");
            var assembly=ScriptableObject.CreateInstance<UdonSharpAssemblyDefinition>();
            assembly.sourceAssembly=AssetDatabase.LoadAssetAtPath<UnityEditorInternal.AssemblyDefinitionAsset>(sourceRoot+"/Runtime/SerieIndustry.VRCBandDB.Runtime.asmdef");
            AssetDatabase.CreateAsset(assembly,assemblyPath);AssetDatabase.SaveAssets();AssetDatabase.ImportAsset(assemblyPath,ImportAssetOptions.ForceUpdate);
        }
        EnsureProgram(sourceRoot+"/Runtime/VbdEventCalendar.cs"); EnsureProgram(sourceRoot+"/Runtime/VbdCalendarRow.cs");
        UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions { IsEditorBuild = true });
        foreach (string name in new[]{"VbdEventCalendar","VbdCalendarRow"}) {
            var program = AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(sourceRoot+"/Runtime/"+name+".asset");
            if (program == null || program.GetRealProgram() == null) throw new Exception("Udon compilation failed: "+name);
            Directory.CreateDirectory(root+"/Runtime/CompiledPrograms");AssetDatabase.Refresh();
            string packagedPath=root+"/Runtime/CompiledPrograms/"+name+".asset";
            var compiled=program.SerializedProgramAsset;
            var packaged=AssetDatabase.LoadMainAssetAtPath(packagedPath);
            if(packaged==null) AssetDatabase.CreateAsset(UnityEngine.Object.Instantiate(compiled),packagedPath);
            else if(packaged!=compiled) { EditorUtility.CopySerialized(compiled,packaged);EditorUtility.SetDirty(packaged); }
        }
        font=AssetDatabase.LoadAssetAtPath<Font>(sourceRoot+"/Fonts/CalendarFont.ttf");
        if (font == null) font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        Scene previous=SceneManager.GetActiveScene(), scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Additive);
        GameObject canvasObject=null;
        try {
            canvasObject=new GameObject("VRCBandDB Calendar",typeof(RectTransform));
            SceneManager.MoveGameObjectToScene(canvasObject,scene); Undo.RegisterCreatedObjectUndo(canvasObject,"Create VRCBandDB Calendar");
            canvasObject.layer=0;
            RectTransform canvasRect=canvasObject.GetComponent<RectTransform>();canvasRect.sizeDelta=new Vector2(1200,840);canvasObject.transform.localScale=Vector3.one*0.002f;
            var canvas=Undo.AddComponent<Canvas>(canvasObject);canvas.renderMode=RenderMode.WorldSpace;
            var raycaster=Undo.AddComponent<GraphicRaycaster>(canvasObject);raycaster.ignoreReversedGraphics=false;
            Type shapeType=null;foreach(var assembly in AppDomain.CurrentDomain.GetAssemblies()) { shapeType=assembly.GetType("VRC.SDK3.Components.VRCUiShape");if(shapeType!=null)break; }
            if(shapeType==null)throw new Exception("VRCUiShape was not found. Install VRChat Worlds SDK.");
            Undo.AddComponent(canvasObject,shapeType);
            var collider=Undo.AddComponent<BoxCollider>(canvasObject);collider.isTrigger=true;collider.size=new Vector3(1200,840,1);
            Image bg=Undo.AddComponent<Image>(canvasObject);bg.color=Background;bg.raycastTarget=false;
            // An opaque depth-writing back plate hides mirrored UI when viewed from behind.
            Directory.CreateDirectory(root+"/Materials");AssetDatabase.Refresh();
            string backMaterialPath=root+"/Materials/CalendarBack.mat";
            var backMaterial=AssetDatabase.LoadAssetAtPath<Material>(backMaterialPath);
            if(backMaterial==null) {
                var shader=Shader.Find("Unlit/Color");if(shader==null)throw new Exception("Unlit/Color shader missing.");
                backMaterial=new Material(shader);backMaterial.color=Color.white;AssetDatabase.CreateAsset(backMaterial,backMaterialPath);
            }
            var back=GameObject.CreatePrimitive(PrimitiveType.Cube);back.name="BackCover";Undo.RegisterCreatedObjectUndo(back,"Create calendar back cover");
            Undo.SetTransformParent(back.transform,canvasObject.transform,"Parent calendar back cover");
            back.transform.localPosition=new Vector3(0,0,4);back.transform.localRotation=Quaternion.identity;back.transform.localScale=new Vector3(1200,840,4);
            Undo.DestroyObjectImmediate(back.GetComponent<Collider>());back.GetComponent<MeshRenderer>().sharedMaterial=backMaterial;
            var calendar=UdonSharpUndo.AddComponent<VbdEventCalendar>(canvasObject);
            UdonBehaviour backing=UdonSharpEditorUtility.GetBackingUdonBehaviour(calendar);
            calendar.sampleCsv=AssetDatabase.LoadAssetAtPath<TextAsset>(sourceRoot+"/Samples/CalendarSample.csv");
            MakeText(canvasObject.transform,"Title","VRC BAND DB.  EVENT CALENDAR",28,24,650,48,30);
            MakeButton(canvasObject.transform,"Refresh","再読込",1024,24,148,48,backing,"Refresh");
            MakeButton(canvasObject.transform,"PreviousDay","< 前日",28,88,130,44,backing,"PreviousDay");
            MakeButton(canvasObject.transform,"Today","今日",170,88,100,44,backing,"Today");
            MakeButton(canvasObject.transform,"NextDay","翌日 >",282,88,130,44,backing,"NextDay");
            calendar.dateText=MakeText(canvasObject.transform,"Date","",440,88,420,44,24);
            calendar.rowObjects=new GameObject[8];calendar.rowTexts=new Text[8];calendar.rowButtons=new Button[8];
            for(int i=0;i<8;i++) {
                var button=MakeButton(canvasObject.transform,"Event"+i,"イベント",28,162+i*72,690,64,null,"");
                calendar.rowObjects[i]=button.gameObject;calendar.rowButtons[i]=button;calendar.rowTexts[i]=button.GetComponentInChildren<Text>();calendar.rowTexts[i].alignment=TextAnchor.MiddleLeft;calendar.rowTexts[i].fontSize=20;
                var row=UdonSharpUndo.AddComponent<VbdCalendarRow>(button.gameObject);row.calendar=calendar;row.slot=i;
                Wire(button.gameObject,UdonSharpEditorUtility.GetBackingUdonBehaviour(row),"Press");UdonSharpEditorUtility.CopyProxyToUdon(row);
            }
            MakeButton(canvasObject.transform,"PreviousPage","< 前へ",28,750,148,44,backing,"PreviousPage");
            calendar.pageText=MakeText(canvasObject.transform,"Page","",190,750,350,44,22);
            MakeButton(canvasObject.transform,"NextPage","次へ >",570,750,148,44,backing,"NextPage");
            var detailHeading=Rect(canvasObject.transform,"DetailHeading",746,162,426,124);
            var headingBackground=Undo.AddComponent<Image>(detailHeading.gameObject);headingBackground.color=Primary;headingBackground.raycastTarget=false;
            calendar.detailTitleText=MakeText(detailHeading,"Title","イベント詳細",18,12,390,100,28);
            calendar.detailTitleText.color=Color.white;calendar.detailTitleText.fontStyle=FontStyle.Bold;
            calendar.detailTitleText.resizeTextForBestFit=true;calendar.detailTitleText.resizeTextMinSize=20;calendar.detailTitleText.resizeTextMaxSize=28;
            calendar.detailText=MakeDetailScroll(canvasObject.transform);
            calendar.statusText=MakeText(canvasObject.transform,"Status","初期化待ち",28,800,1144,30,16);
            calendar.Render();
            UdonSharpEditorUtility.CopyProxyToUdon(calendar);
            // Keep distributable programs inside the asset without relocating SDK compiler cache files.
            foreach(var behaviour in canvasObject.GetComponentsInChildren<UdonBehaviour>(true)) {
                var serialized=new SerializedObject(behaviour);
                string name=behaviour.gameObject==canvasObject?"VbdEventCalendar":"VbdCalendarRow";
                serialized.FindProperty("serializedProgramAsset").objectReferenceValue=AssetDatabase.LoadMainAssetAtPath(root+"/Runtime/CompiledPrograms/"+name+".asset");
                serialized.ApplyModifiedProperties();
            }
            Canvas.ForceUpdateCanvases();LayoutRebuilder.ForceRebuildLayoutImmediate(canvasRect);
            Directory.CreateDirectory(root+"/Prefabs");AssetDatabase.Refresh();
            string prefabPath=root+"/Prefabs/VRCBandDB Calendar.prefab";
            PrefabUtility.SaveAsPrefabAsset(canvasObject,prefabPath);
            int tests=VbdCalendarEditorTests.Run(calendar)+VbdCalendarDepthTests.Run(canvasObject);
            // Editor tests only touch the temporary preview instance; restore production defaults.
            EditorSceneManager.CloseScene(scene,true);scene=default(Scene);SceneManager.SetActiveScene(previous);
            AssetDatabase.SaveAssets();
            File.WriteAllText("Library/VRCBandDBCalendar-build-result.json",JsonUtility.ToJson(new Report {ok=true,message="Prefab generated; Udon compiled; editor tests passed. Active user scenes were not saved.",prefab=prefabPath,tests=tests},true));
            Debug.Log("[VRCBandDB Calendar] Built prefab and passed "+tests+" editor tests: "+prefabPath);
        } finally {if(scene.IsValid()&&scene.isLoaded)EditorSceneManager.CloseScene(scene,true);if(previous.IsValid()&&previous.isLoaded)SceneManager.SetActiveScene(previous);}
    }
    private static void EnsureProgram(string scriptPath) {
        string path=Path.ChangeExtension(scriptPath,"asset");if(AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(path)!=null)return;
        if(scriptPath.StartsWith("Packages/"))throw new Exception("Missing distributed program asset: "+path);
        var program=ScriptableObject.CreateInstance<UdonSharpProgramAsset>();program.sourceCsScript=AssetDatabase.LoadAssetAtPath<MonoScript>(scriptPath);if(program.sourceCsScript==null)throw new Exception("Missing script: "+scriptPath);AssetDatabase.CreateAsset(program,path);
    }
    private static RectTransform Rect(Transform parent,string name,float x,float y,float width,float height) {
        var go=new GameObject(name,typeof(RectTransform));Undo.RegisterCreatedObjectUndo(go,"Create calendar UI");Undo.SetTransformParent(go.transform,parent,"Parent calendar UI");go.layer=5;
        var rt=go.GetComponent<RectTransform>();rt.anchorMin=rt.anchorMax=new Vector2(0,1);rt.pivot=new Vector2(0,1);rt.anchoredPosition=new Vector2(x,-y);rt.sizeDelta=new Vector2(width,height);rt.localScale=Vector3.one;return rt;
    }
    private static Text MakeText(Transform parent,string name,string value,float x,float y,float width,float height,int size) {
        var rt=Rect(parent,name,x,y,width,height);var text=Undo.AddComponent<Text>(rt.gameObject);text.font=font;text.fontSize=size;text.color=Ink;text.supportRichText=false;text.text=value;text.raycastTarget=false;text.alignment=TextAnchor.MiddleLeft;text.horizontalOverflow=HorizontalWrapMode.Wrap;text.verticalOverflow=VerticalWrapMode.Truncate;return text;
    }
    private static Button MakeButton(Transform parent,string name,string label,float x,float y,float width,float height,UdonBehaviour target,string method) {
        var rt=Rect(parent,name,x,y,width,height);var image=Undo.AddComponent<Image>(rt.gameObject);image.color=Primary;image.raycastTarget=true;
        var button=Undo.AddComponent<Button>(rt.gameObject);button.targetGraphic=image;var colors=button.colors;colors.normalColor=Color.white;colors.highlightedColor=new Color(.75f,.9f,.8f);colors.pressedColor=new Color(.5f,.7f,.55f);button.colors=colors;var nav=button.navigation;nav.mode=Navigation.Mode.None;button.navigation=nav;
        var text=MakeText(rt,"Label",label,12,0,width-24,height,21);text.color=Color.white;text.alignment=TextAnchor.MiddleCenter;
        if(target!=null)Wire(rt.gameObject,target,method);return button;
    }
    private static void Wire(GameObject go,UdonBehaviour target,string method) {
        go.GetComponent<Button>().onClick.RemoveAllListeners();
        var trigger=go.GetComponent<EventTrigger>();if(trigger==null)trigger=Undo.AddComponent<EventTrigger>(go);trigger.triggers.Clear();
        var entry=new EventTrigger.Entry {eventID=EventTriggerType.PointerDown};UnityEventTools.AddStringPersistentListener(entry.callback,target.SendCustomEvent,method);trigger.triggers.Add(entry);
        if(method=="PreviousDay"||method=="NextDay"||method=="Today") {
            var release=new EventTrigger.Entry {eventID=EventTriggerType.PointerUp};
            UnityEventTools.AddStringPersistentListener(release.callback,target.SendCustomEvent,"ReleaseDateInput");trigger.triggers.Add(release);
        }
    }
    private static Text MakeDetailScroll(Transform parent) {
        RectTransform root=Rect(parent,"Details",746,286,426,508);var surface=Undo.AddComponent<Image>(root.gameObject);surface.color=Color.white;surface.raycastTarget=true;
        RectTransform viewport=Rect(root,"Viewport",18,18,390,472);Undo.AddComponent<RectMask2D>(viewport.gameObject);
        var text=MakeText(viewport,"Content","左のイベントを選択してください。",0,0,390,472,21);text.verticalOverflow=VerticalWrapMode.Overflow;text.lineSpacing=1.25f;
        var fit=Undo.AddComponent<ContentSizeFitter>(text.gameObject);fit.verticalFit=ContentSizeFitter.FitMode.PreferredSize;
        var scroll=Undo.AddComponent<ScrollRect>(root.gameObject);scroll.viewport=viewport;scroll.content=text.rectTransform;scroll.horizontal=false;scroll.vertical=true;scroll.movementType=ScrollRect.MovementType.Clamped;scroll.scrollSensitivity=32;return text;
    }
    [Serializable] private class Report {public bool ok;public string message;public string prefab;public int tests;}
}
}
#endif



