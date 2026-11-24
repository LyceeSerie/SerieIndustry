#if UNITY_EDITOR
using System;
using UnityEngine;
using UnityEngine.UI;
namespace SerieIndustry.VRCBandDB.Editor {
public static class VbdCalendarDepthTests {
    public static int Run(GameObject root) {
        var transforms=root.GetComponentsInChildren<Transform>(true);var layers=new int[transforms.Length];
        for(int i=0;i<transforms.Length;i++){layers[i]=transforms[i].gameObject.layer;transforms[i].gameObject.layer=31;}
        var cameraObject=new GameObject("Calendar depth test camera",typeof(Camera));
        var rear=new GameObject("Calendar depth test rear UI",typeof(RectTransform),typeof(Canvas),typeof(Image));
        var texture=new RenderTexture(64,64,24);var pixel=new Texture2D(1,1,TextureFormat.RGB24,false);
        var previous=RenderTexture.active;
        try {
            var rearCanvas=rear.GetComponent<Canvas>();rearCanvas.renderMode=RenderMode.WorldSpace;rearCanvas.sortingOrder=1000;
            rear.layer=31;rear.transform.position=new Vector3(0,0,.1f);rear.transform.localScale=Vector3.one*.002f;
            rear.GetComponent<RectTransform>().sizeDelta=new Vector2(1200,840);rear.GetComponent<Image>().color=Color.red;
            var camera=cameraObject.GetComponent<Camera>();camera.orthographic=true;camera.orthographicSize=1;camera.cullingMask=1<<31;
            camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.black;camera.targetTexture=texture;
            camera.transform.position=new Vector3(0,0,-5);camera.transform.rotation=Quaternion.identity;
            Canvas.ForceUpdateCanvases();camera.Render();RenderTexture.active=texture;
            pixel.ReadPixels(new Rect(32,32,1,1),0,0);pixel.Apply();Color front=pixel.GetPixel(0,0);
            if(front.r>.8f&&front.g<.2f)throw new Exception("Rear UI drew through the calendar front.");
            rear.SetActive(false);camera.transform.position=new Vector3(0,0,5);camera.transform.rotation=Quaternion.Euler(0,180,0);
            camera.Render();pixel.ReadPixels(new Rect(32,32,1,1),0,0);pixel.Apply();Color back=pixel.GetPixel(0,0);
            if(back.r<.95f||back.g<.95f||back.b<.95f)throw new Exception("Calendar back is not opaque white.");
            return 2;
        } finally {
            RenderTexture.active=previous;
            UnityEngine.Object.DestroyImmediate(cameraObject);UnityEngine.Object.DestroyImmediate(rear);
            UnityEngine.Object.DestroyImmediate(texture);UnityEngine.Object.DestroyImmediate(pixel);
            for(int i=0;i<transforms.Length;i++)transforms[i].gameObject.layer=layers[i];
        }
    }
}
}
#endif
