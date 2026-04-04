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
