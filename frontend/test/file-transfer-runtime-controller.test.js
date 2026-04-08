import test from "node:test"
import assert from "node:assert/strict"

import { createFileTransferRuntimeController } from "../src/public/file-transfer-runtime-controller.js"

function createDocumentRef() {
  const anchors = []
  const parent = {
    appendChild(node) {
      anchors.push(node)
    },
    removeChild(node) {
      const index = anchors.indexOf(node)
      if (index >= 0) {
        anchors.splice(index, 1)
      }
    }
  }
  return {
    anchors,
    body: parent,
    documentElement: parent,
    createElement(tagName) {
      return {
        tagName,
        style: {},
        clickCalled: false,
        click() {
          this.clickCalled = true
        },
        remove() {
          const index = anchors.indexOf(this)
          if (index >= 0) {
            anchors.splice(index, 1)
          }
        }
      }
    }
  }
}

function createUploadPickerEnvironment() {
  let focusHandler = null
  let createdInput = null
  const parent = {
    appendChild(node) {
      createdInput = node
    },
    removeChild(node) {
      if (createdInput === node) {
        createdInput = null
      }
    }
  }
  return {
    documentRef: {
      body: parent,
      documentElement: parent,
      createElement(tagName) {
        return {
          tagName,
          style: {},
          files: [],
          listeners: new Map(),
          addEventListener(type, handler) {
            this.listeners.set(type, handler)
          },
          click() {},
          remove() {
            if (createdInput === this) {
              createdInput = null
            }
          },
          emit(type) {
            this.listeners.get(type)?.()
          }
        }
      }
    },
    windowRef: {
      addEventListener(type, handler) {
        if (type === "focus") {
          focusHandler = handler
        }
      },
      removeEventListener(type, handler) {
        if (type === "focus" && focusHandler === handler) {
          focusHandler = null
        }
      },
      setTimeout(callback) {
        callback()
      }
    },
    getCreatedInput() {
      return createdInput
    },
    triggerFocus() {
      focusHandler?.()
    }
  }
}

test("file transfer runtime controller uploads picked files and formats feedback", async () => {
  const calls = []
  const controller = createFileTransferRuntimeController({
    api: {
      async uploadSessionFile(sessionId, payload) {
        calls.push(["upload", sessionId, payload])
        return {
          sessionId,
          path: payload.path,
          fileName: "output.txt",
          sizeBytes: 7,
          created: true
        }
      }
    },
    pickUploadFile: async () => ({
      name: "output.txt",
      async arrayBuffer() {
        return Uint8Array.from([117, 112, 100, 97, 116, 101, 100]).buffer
      }
    }),
    formatSessionToken: () => "7",
    formatSessionDisplayName: () => "ops"
  })

  const outcome = await controller.uploadSessionFile({ id: "s1", name: "ops" }, { remotePath: "logs/output.txt" })

  assert.equal(outcome.canceled, false)
  assert.equal(outcome.feedback, "Uploaded logs/output.txt to [7] ops (7 bytes).")
  assert.deepEqual(calls, [["upload", "s1", { path: "logs/output.txt", contentBase64: "dXBkYXRlZA==" }]])
})

test("file transfer runtime controller returns canceled feedback when picker closes without a file", async () => {
  const controller = createFileTransferRuntimeController({
    api: {
      async uploadSessionFile() {
        throw new Error("upload should not run when picker is canceled")
      }
    },
    pickUploadFile: async () => null
  })

  const outcome = await controller.uploadSessionFile({ id: "s1", name: "ops" })

  assert.equal(outcome.canceled, true)
  assert.equal(outcome.feedback, "Upload canceled.")
})

test("file transfer runtime controller downloads payloads through blob download support", async () => {
  const documentRef = createDocumentRef()
  const objectUrls = []
  const revokedUrls = []
  const controller = createFileTransferRuntimeController({
    api: {
      async downloadSessionFile(sessionId, path) {
        assert.equal(sessionId, "s1")
        assert.equal(path, "logs/output.txt")
        return {
          sessionId,
          path,
          fileName: "output.txt",
          contentType: "application/octet-stream",
          encoding: "base64",
          contentBase64: "dXBkYXRlZA==",
          sizeBytes: 7
        }
      }
    },
    documentRef,
    URLRef: {
      createObjectURL(blob) {
        objectUrls.push(blob)
        return "blob:transfer"
      },
      revokeObjectURL(url) {
        revokedUrls.push(url)
      }
    },
    BlobCtor: class FakeBlob {
      constructor(parts, options = {}) {
        this.parts = parts
        this.type = options.type
      }
    },
    formatSessionToken: () => "7",
    formatSessionDisplayName: () => "ops"
  })

  const outcome = await controller.downloadSessionFile({ id: "s1", name: "ops" }, { remotePath: "logs/output.txt" })

  assert.equal(outcome.feedback, "Downloaded logs/output.txt from [7] ops (7 bytes).")
  assert.equal(objectUrls.length, 1)
  assert.equal(objectUrls[0].type, "application/octet-stream")
  assert.equal(revokedUrls[0], "blob:transfer")
})

test("file transfer runtime controller can trigger downloads from a provided payload without an API client", async () => {
  const documentRef = createDocumentRef()
  const objectUrls = []
  const controller = createFileTransferRuntimeController({
    documentRef,
    URLRef: {
      createObjectURL(blob) {
        objectUrls.push(blob)
        return "blob:payload"
      },
      revokeObjectURL() {}
    },
    BlobCtor: class FakeBlob {
      constructor(parts, options = {}) {
        this.parts = parts
        this.type = options.type
      }
    }
  })

  const outcome = await controller.downloadSessionFile(
    { id: "s1", name: "ops" },
    {
      remotePath: "logs/output.txt",
      payload: {
        sessionId: "s1",
        path: "logs/output.txt",
        fileName: "output.txt",
        contentType: "application/octet-stream",
        encoding: "base64",
        contentBase64: "dXBkYXRlZA==",
        sizeBytes: 7
      }
    }
  )

  assert.equal(outcome.payload.fileName, "output.txt")
  assert.equal(objectUrls.length, 1)
})

test("file transfer runtime controller rejects unsupported download and upload browser paths", async () => {
  const downloadController = createFileTransferRuntimeController({
    api: {
      async downloadSessionFile() {
        return {
          sessionId: "s1",
          path: "logs/output.txt",
          fileName: "output.txt",
          contentType: "application/octet-stream",
          encoding: "base64",
          contentBase64: "dXBkYXRlZA==",
          sizeBytes: 7
        }
      }
    },
    documentRef: null,
    URLRef: null,
    BlobCtor: null
  })

  await assert.rejects(
    () => downloadController.downloadSessionFile({ id: "s1" }, { remotePath: "logs/output.txt" }),
    /download is unavailable/
  )

  const uploadController = createFileTransferRuntimeController({
    api: {
      async uploadSessionFile() {
        throw new Error("should not reach upload api")
      }
    }
  })

  await assert.rejects(
    () =>
      uploadController.uploadSessionFile(
        { id: "s1" },
        {
          file: {
            name: "broken.txt"
          }
        }
      ),
    /upload is unavailable/
  )
})

test("file transfer runtime controller validates missing session, api, and path branches", async () => {
  const controller = createFileTransferRuntimeController({
    api: {
      async uploadSessionFile() {
        return {}
      }
    },
    pickUploadFile: async () => ({
      name: "",
      async arrayBuffer() {
        return Uint8Array.from([1]).buffer
      }
    })
  })

  await assert.rejects(() => controller.uploadSessionFile(null, {}), /requires a session/i)
  await assert.rejects(
    () => createFileTransferRuntimeController({ pickUploadFile: async () => ({}) }).uploadSessionFile({ id: "s1" }),
    /upload API is unavailable/i
  )
  await assert.rejects(
    () => controller.uploadSessionFile({ id: "s1" }, { remotePath: " " }),
    /Upload path is required/i
  )
  await assert.rejects(
    () => controller.downloadSessionFile(null, { remotePath: "logs/file.txt" }),
    /requires a session/i
  )
  await assert.rejects(
    () => createFileTransferRuntimeController().downloadSessionFile({ id: "s1" }, { remotePath: "logs/file.txt" }),
    /download API is unavailable/i
  )
  await assert.rejects(
    () =>
      createFileTransferRuntimeController({
        api: {
          async downloadSessionFile() {
            return {
              fileName: "output.txt",
              contentBase64: "QQ==",
              sizeBytes: 1
            }
          }
        },
        documentRef: createDocumentRef(),
        URLRef: {
          createObjectURL() {
            return "blob:test"
          },
          revokeObjectURL() {}
        },
        BlobCtor: class FakeBlob {
          constructor(parts) {
            this.parts = parts
          }
        }
      }).downloadSessionFile({ id: "s1" }, { remotePath: " " }),
    /Download path is required/i
  )
})

test("file transfer runtime controller supports the default picker change and focus-cancel flows", async () => {
  const uploadEnv = createUploadPickerEnvironment()
  const uploadController = createFileTransferRuntimeController({
    api: {
      async uploadSessionFile(sessionId, payload) {
        return {
          sessionId,
          path: payload.path,
          fileName: "picked.txt",
          sizeBytes: 3
        }
      }
    },
    documentRef: uploadEnv.documentRef,
    windowRef: uploadEnv.windowRef
  })

  const uploadPromise = uploadController.uploadSessionFile({ id: "s1", name: "ops" })
  const pickedInput = uploadEnv.getCreatedInput()
  pickedInput.files = [
    {
      name: "picked.txt",
      async arrayBuffer() {
        return Uint8Array.from([65, 66, 67]).buffer
      }
    }
  ]
  pickedInput.emit("change")
  const uploadResult = await uploadPromise
  assert.equal(uploadResult.canceled, false)
  assert.match(uploadResult.feedback, /Uploaded picked.txt/)

  const cancelEnv = createUploadPickerEnvironment()
  const cancelController = createFileTransferRuntimeController({
    api: {
      async uploadSessionFile() {
        throw new Error("should not upload")
      }
    },
    documentRef: cancelEnv.documentRef,
    windowRef: cancelEnv.windowRef
  })
  const cancelPromise = cancelController.uploadSessionFile({ id: "s1", name: "ops" })
  cancelEnv.triggerFocus()
  const cancelResult = await cancelPromise
  assert.equal(cancelResult.canceled, true)
})

test("file transfer runtime controller removes download anchors when remove() is unavailable", async () => {
  const anchors = []
  const parent = {
    appendChild(node) {
      anchors.push(node)
    },
    removeChild(node) {
      const index = anchors.indexOf(node)
      if (index >= 0) {
        anchors.splice(index, 1)
      }
    }
  }
  const documentRef = {
    body: parent,
    documentElement: parent,
    createElement() {
      return {
        style: {},
        click() {},
        remove: undefined
      }
    }
  }
  const revoked = []
  const controller = createFileTransferRuntimeController({
    documentRef,
    URLRef: {
      createObjectURL() {
        return "blob:remove-child"
      },
      revokeObjectURL(url) {
        revoked.push(url)
      }
    },
    BlobCtor: class FakeBlob {
      constructor(parts) {
        this.parts = parts
      }
    }
  })

  await controller.downloadSessionFile(
    { id: "s1", name: "ops" },
    {
      remotePath: "logs/output.txt",
      payload: {
        fileName: "output.txt",
        contentType: "application/octet-stream",
        contentBase64: "QQ==",
        sizeBytes: 1
      }
    }
  )

  assert.deepEqual(anchors, [])
  assert.deepEqual(revoked, ["blob:remove-child"])
})
