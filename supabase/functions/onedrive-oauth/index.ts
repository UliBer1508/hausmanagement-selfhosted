/**
 * onedrive-api — alle Dateioperationen gegen OneDrive.
 *
 * Eine Function mit mehreren Aktionen statt vieler kleiner Functions:
 * jede braucht denselben Token-Helfer und dieselbe Rechtepruefung.
 *
 * Aktionen:
 *   status        — ist OneDrive verbunden?
 *   listFolders   — Unterordner eines Ordners
 *   listChildren  — Ordner UND Dateien eines Ordners
 *   createFolder  — Ordner anlegen
 *   resolvePath   — Pfad aus der Typ-Regel anlegen/finden -> item_id
 *   uploadSession — Upload-Adresse anfordern (Bytes laufen NICHT hier durch)
 *   itemInfo      — Metadaten einer Datei (nach dem Upload)
 *   deleteItem    — Datei in den OneDrive-Papierkorb
 *
 * WARUM Upload-Session: Der Browser laedt die Bytes direkt zu Microsoft.
 * So faellt die 4-MB-Grenze des einfachen Uploads weg, und das Zugriffs-
 * token verlaesst die Edge Function nie — der Browser bekommt nur eine
 * kurzlebige, vorautorisierte Adresse.
 *
 * verify_jwt = false in config.toml; die Rechtepruefung macht
 * requireAdmin() selbst (Muster der uebrigen Functions).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAdmin } from "../_shared/auth.ts";
import {
  corsHeaders,
  serviceClient,
  getAccessToken,
  graph,
  ensureFolderPath,
  OneDriveAuthError,
} from "../_shared/onedrive.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireAdmin(req, corsHeaders);
  if (denied) return denied;

  let action = "";
  try {
    const payload = await req.json();
    action = payload.action ?? "";
    const supabase = serviceClient();

    // ---- status: ohne Token antworten, statt zu scheitern -------------
    if (action === "status") {
      const { data } = await supabase
        .from("integration_tokens")
        .select("account_label, last_error, updated_at")
        .eq("provider", "onedrive")
        .maybeSingle();

      return json({
        connected: !!data && !data.last_error,
        account: data?.account_label ?? null,
        lastError: data?.last_error ?? null,
        since: data?.updated_at ?? null,
      });
    }

    const token = await getAccessToken(supabase);

    switch (action) {
      // ---- Ordner auflisten ------------------------------------------
      case "listFolders":
      case "listChildren": {
        const parent = payload.parentId || "root";
        const res = await graph(
          token,
          `/me/drive/items/${parent}/children?$select=id,name,folder,file,size,webUrl,lastModifiedDateTime&$top=999&$orderby=name`,
        );
        const all = res?.value ?? [];
        const folders = all
          .filter((i: any) => i.folder)
          .map((i: any) => ({ id: i.id, name: i.name, childCount: i.folder.childCount ?? 0 }));

        if (action === "listFolders") return json({ folders });

        const files = all
          .filter((i: any) => i.file)
          .map((i: any) => ({
            id: i.id,
            name: i.name,
            size: i.size ?? 0,
            mimeType: i.file?.mimeType ?? null,
            webUrl: i.webUrl,
            modified: i.lastModifiedDateTime,
          }));
        return json({ folders, files });
      }

      // ---- Ordner anlegen --------------------------------------------
      case "createFolder": {
        const { parentId, name } = payload;
        if (!name?.trim()) return json({ error: "Ordnername fehlt." }, 400);

        const created = await graph(token, `/me/drive/items/${parentId || "root"}/children`, {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            folder: {},
            "@microsoft.graph.conflictBehavior": "rename",
          }),
        });
        return json({ id: created.id, name: created.name });
      }

      // ---- Pfad aus der Typ-Regel sicherstellen ----------------------
      case "resolvePath": {
        const { path } = payload;
        if (!path?.trim()) return json({ error: "Pfad fehlt." }, 400);
        const id = await ensureFolderPath(token, path);
        return json({ id, path });
      }

      // ---- Upload-Adresse anfordern ----------------------------------
      case "uploadSession": {
        const { folderId, fileName } = payload;
        if (!folderId || !fileName) return json({ error: "folderId und fileName noetig." }, 400);

        const session = await graph(
          token,
          `/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/createUploadSession`,
          {
            method: "POST",
            body: JSON.stringify({
              item: {
                "@microsoft.graph.conflictBehavior": "rename",
                name: fileName,
              },
            }),
          },
        );
        return json({ uploadUrl: session.uploadUrl, expires: session.expirationDateTime });
      }

      // ---- Metadaten einer Datei -------------------------------------
      case "itemInfo": {
        const { itemId } = payload;
        if (!itemId) return json({ error: "itemId fehlt." }, 400);
        const item = await graph(
          token,
          `/me/drive/items/${itemId}?$select=id,name,size,webUrl,file,parentReference`,
        );
        return json({
          id: item.id,
          name: item.name,
          size: item.size ?? 0,
          webUrl: item.webUrl,
          mimeType: item.file?.mimeType ?? null,
          driveId: item.parentReference?.driveId ?? null,
          path: (item.parentReference?.path ?? "").replace("/drive/root:", "").replace(/^\//, ""),
        });
      }

      // ---- Datei in den Papierkorb -----------------------------------
      case "deleteItem": {
        const { itemId } = payload;
        if (!itemId) return json({ error: "itemId fehlt." }, 400);
        await graph(token, `/me/drive/items/${itemId}`, { method: "DELETE" });
        return json({ deleted: true });
      }

      default:
        return json({ error: `Unbekannte Aktion: ${action}` }, 400);
    }
  } catch (e) {
    console.error(`onedrive-api [${action}]:`, e);

    if (e instanceof OneDriveAuthError) {
      return json({ error: e.message, needsReconnect: true }, 409);
    }
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
