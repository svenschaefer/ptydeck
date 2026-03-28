function normalizeText(value) {
  return typeof value === "string" ? value : String(value ?? "")
}

function formatByteCount(value) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0) {
    return "0 bytes"
  }
  return `${Math.trunc(normalized)} bytes`
}

function encodeBytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64")
  }
  const chunks = []
  for (const value of bytes) {
    chunks.push(String.fromCharCode(value))
  }
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(chunks.join(""))
  }
  throw new Error("File transfer base64 encoding is unavailable in this browser.")
}

function decodeBase64ToBytes(value) {
  const text = normalizeText(value)
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "base64")
  }
  if (typeof globalThis.atob !== "function") {
    throw new Error("File transfer base64 decoding is unavailable in this browser.")
  }
  const binary = globalThis.atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function buildUploadFeedback({ session, payload, formatSessionToken, formatSessionDisplayName }) {
  const token = formatSessionToken(session?.id)
  const name = formatSessionDisplayName(session)
  return `Uploaded ${payload?.path || payload?.fileName || "file"} to [${token}] ${name} (${formatByteCount(payload?.sizeBytes)}).`
}

function buildDownloadFeedback({ session, payload, formatSessionToken, formatSessionDisplayName }) {
  const token = formatSessionToken(session?.id)
  const name = formatSessionDisplayName(session)
  return `Downloaded ${payload?.path || payload?.fileName || "file"} from [${token}] ${name} (${formatByteCount(payload?.sizeBytes)}).`
}

export function createFileTransferRuntimeController(options = {}) {
  const api = options.api || null
  const documentRef = options.documentRef || globalThis.document || null
  const windowRef = options.windowRef || globalThis.window || null
  const URLRef = options.URLRef || globalThis.URL || null
  const BlobCtor = options.BlobCtor || globalThis.Blob
  const pickUploadFile =
    typeof options.pickUploadFile === "function" ? options.pickUploadFile : defaultPickUploadFile
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "")
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "")

  function assertDownloadSupport() {
    if (
      !documentRef ||
      typeof documentRef.createElement !== "function" ||
      !URLRef ||
      typeof URLRef.createObjectURL !== "function" ||
      typeof URLRef.revokeObjectURL !== "function" ||
      typeof BlobCtor !== "function"
    ) {
      throw new Error("File transfer download is unavailable in this browser.")
    }
  }

  function defaultPickUploadFile() {
    if (!documentRef || typeof documentRef.createElement !== "function") {
      throw new Error("File upload is unavailable in this browser.")
    }
    return new Promise((resolve) => {
      const input = documentRef.createElement("input")
      let settled = false

      const finish = (file = null) => {
        if (settled) {
          return
        }
        settled = true
        if (windowRef && typeof windowRef.removeEventListener === "function") {
          windowRef.removeEventListener("focus", handleWindowFocus, true)
        }
        if (typeof input.remove === "function") {
          input.remove()
        }
        resolve(file)
      }

      const handleWindowFocus = () => {
        const defer =
          windowRef && typeof windowRef.setTimeout === "function"
            ? windowRef.setTimeout.bind(windowRef)
            : globalThis.setTimeout.bind(globalThis)
        defer(() => {
          if (!settled) {
            finish(null)
          }
        }, 0)
      }

      input.type = "file"
      input.multiple = false
      if (input.style && typeof input.style === "object") {
        input.style.display = "none"
      }
      if (typeof input.addEventListener === "function") {
        input.addEventListener(
          "change",
          () => {
            const file = input.files && input.files[0] ? input.files[0] : null
            finish(file)
          },
          { once: true }
        )
      }
      if (windowRef && typeof windowRef.addEventListener === "function") {
        windowRef.addEventListener("focus", handleWindowFocus, true)
      }
      const parent = documentRef.body || documentRef.documentElement || null
      if (parent && typeof parent.appendChild === "function") {
        parent.appendChild(input)
      }
      if (typeof input.click === "function") {
        input.click()
      } else {
        finish(null)
      }
    })
  }

  async function readFileBytes(file) {
    if (!file) {
      throw new Error("No file selected for upload.")
    }
    if (typeof file.arrayBuffer === "function") {
      const buffer = await file.arrayBuffer()
      return new Uint8Array(buffer)
    }
    throw new Error("File upload is unavailable in this browser.")
  }

  function triggerDownload(payload, downloadName = "") {
    assertDownloadSupport()
    const bytes = decodeBase64ToBytes(payload?.contentBase64)
    const blob = new BlobCtor([bytes], {
      type: normalizeText(payload?.contentType) || "application/octet-stream"
    })
    const objectUrl = URLRef.createObjectURL(blob)
    const anchor = documentRef.createElement("a")
    anchor.href = objectUrl
    anchor.download = normalizeText(downloadName) || normalizeText(payload?.fileName) || "session-file.bin"
    if (anchor.style && typeof anchor.style === "object") {
      anchor.style.display = "none"
    }
    const parent = documentRef.body || documentRef.documentElement || null
    if (parent && typeof parent.appendChild === "function") {
      parent.appendChild(anchor)
    }
    if (typeof anchor.click === "function") {
      anchor.click()
    }
    if (typeof anchor.remove === "function") {
      anchor.remove()
    } else if (parent && typeof parent.removeChild === "function") {
      parent.removeChild(anchor)
    }
    URLRef.revokeObjectURL(objectUrl)
  }

  async function uploadSessionFile(session, { remotePath = "", file = null } = {}) {
    if (!session?.id) {
      throw new Error("File upload requires a session.")
    }
    if (!api || typeof api.uploadSessionFile !== "function") {
      throw new Error("File upload API is unavailable.")
    }
    const selectedFile = file || (await pickUploadFile())
    if (!selectedFile) {
      return {
        canceled: true,
        payload: null,
        feedback: "Upload canceled."
      }
    }
    const bytes = await readFileBytes(selectedFile)
    const effectivePath = normalizeText(remotePath) || normalizeText(selectedFile.name)
    if (!effectivePath) {
      throw new Error("Upload path is required.")
    }
    const payload = await api.uploadSessionFile(session.id, {
      path: effectivePath,
      contentBase64: encodeBytesToBase64(bytes)
    })
    return {
      canceled: false,
      payload,
      feedback: buildUploadFeedback({
        session,
        payload,
        formatSessionToken,
        formatSessionDisplayName
      })
    }
  }

  async function downloadSessionFile(session, { remotePath = "", downloadName = "", payload = null } = {}) {
    if (!session?.id) {
      throw new Error("File download requires a session.")
    }
    if (!api || typeof api.downloadSessionFile !== "function") {
      throw new Error("File download API is unavailable.")
    }
    const normalizedPath = normalizeText(remotePath)
    if (!normalizedPath) {
      throw new Error("Download path is required.")
    }
    const responsePayload = payload || (await api.downloadSessionFile(session.id, normalizedPath))
    triggerDownload(responsePayload, downloadName)
    return {
      payload: responsePayload,
      feedback: buildDownloadFeedback({
        session,
        payload: responsePayload,
        formatSessionToken,
        formatSessionDisplayName
      })
    }
  }

  return {
    uploadSessionFile,
    downloadSessionFile
  }
}
