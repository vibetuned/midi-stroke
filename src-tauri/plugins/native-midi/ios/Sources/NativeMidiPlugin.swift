import AVFoundation
import CoreAudioKit
import CoreMIDI
import SwiftRs
import Tauri
import UIKit
import WebKit

class StartArgs: Decodable {
  let messages: Channel
  let devices: Channel
}

class SendArgs: Decodable {
  let portMatch: String
  let data: [UInt8]
}

/// MIDI for Midi Stroke on iOS (CoreMIDI): every source is listened to — USB,
/// the network, and Bluetooth once paired from `bluetooth` — and its MIDI 1.0
/// channel voice messages sent to the shell (src/mobile.rs) as [status,
/// data1, data2]; every destination can be sent to. The plugin also makes the
/// app a music app: it sounds with the silent switch on, and the screen stays
/// on while it is open — practice is played on an instrument, not the screen.
class NativeMidiPlugin: Plugin {
  private var client = MIDIClientRef()
  private var input = MIDIPortRef()
  private var output = MIDIPortRef()
  private var connected: [MIDIEndpointRef] = []
  private var messages: Channel?
  private var devices: Channel?
  private var listening = false

  override func load(webview: WKWebView) {
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
    try? AVAudioSession.sharedInstance().setActive(true)
    DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true }
  }

  @objc public func start(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartArgs.self)
    DispatchQueue.main.async {
      self.messages = args.messages
      self.devices = args.devices
      if !self.listening {
        // Notifications come on this (the main) thread: a device plugged in or paired is listened to at once.
        var status = MIDIClientCreateWithBlock("Midi Stroke" as CFString, &self.client) { [weak self] note in
          if note.pointee.messageID == .msgSetupChanged {
            DispatchQueue.main.async { self?.listen() }
          }
        }
        if status == noErr {
          status = MIDIInputPortCreateWithProtocol(self.client, "Midi Stroke in" as CFString, ._1_0, &self.input) {
            [weak self] list, _ in self?.receive(list)
          }
        }
        if status == noErr {
          status = MIDIOutputPortCreate(self.client, "Midi Stroke out" as CFString, &self.output)
        }
        if status != noErr {
          invoke.reject("MIDI is not available (\(status))")
          return
        }
        self.listening = true
      }
      self.listen()
      invoke.resolve()
    }
  }

  @objc public func outputs(_ invoke: Invoke) {
    DispatchQueue.main.async {
      let names = (0..<MIDIGetNumberOfDestinations()).map { self.name(of: MIDIGetDestination($0)) }
      invoke.resolve(["names": names])
    }
  }

  @objc public func send(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SendArgs.self)
    let needles = args.portMatch.split(separator: "|")
      .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
      .filter { !$0.isEmpty }
    DispatchQueue.main.async {
      let destination = (0..<MIDIGetNumberOfDestinations()).map { MIDIGetDestination($0) }
        .first { d in
          let name = self.name(of: d).lowercased()
          return needles.contains { name.contains($0) }
        }
      guard let destination = destination, self.listening else {
        invoke.reject("no MIDI output matching '\(args.portMatch)'")
        return
      }
      let status = self.send(args.data, to: destination)
      if status == noErr { invoke.resolve() } else { invoke.reject("MIDI send failed (\(status))") }
    }
  }

  /// Apple's Bluetooth MIDI view: the instruments in range, to connect or disconnect.
  @objc public func bluetooth(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard let presenter = self.manager.viewController else {
        invoke.reject("no view to present from")
        return
      }
      let central = CABTMIDICentralViewController()
      central.navigationItem.rightBarButtonItem = UIBarButtonItem(
        barButtonSystemItem: .done, target: self, action: #selector(self.closeBluetooth))
      let navigation = UINavigationController(rootViewController: central)
      navigation.modalPresentationStyle = .formSheet
      presenter.present(navigation, animated: true)
      invoke.resolve()
    }
  }

  @objc private func closeBluetooth() {
    manager.viewController?.dismiss(animated: true)
  }

  /// Listen to every source there is now, and tell the shell their names.
  private func listen() {
    for source in connected { MIDIPortDisconnectSource(input, source) }
    connected = []
    var names: [String] = []
    for k in 0..<MIDIGetNumberOfSources() {
      let source = MIDIGetSource(k)
      if MIDIPortConnectSource(input, source, nil) == noErr {
        connected.append(source)
        names.append(name(of: source))
      }
    }
    let payload: JsonObject = ["names": names]
    devices?.send(payload)
  }

  /// MIDI 1.0 as Universal MIDI Packets: a channel voice message is one 32-bit
  /// word of type 2 — [2][group][status][data1][data2]. The rest (system
  /// messages, SysEx) is left out, as the desktop bridge does.
  private func receive(_ list: UnsafePointer<MIDIEventList>) {
    for packet in list.unsafeSequence() {
      let count = Int(packet.pointee.wordCount)
      withUnsafeBytes(of: packet.pointee.words) { raw in
        let words = raw.bindMemory(to: UInt32.self)
        var k = 0
        while k < count && k < words.count {
          let word = words[k]
          let type = word >> 28
          if type == 2 {
            let status = (word >> 16) & 0xFF
            let data1 = (word >> 8) & 0x7F
            let data2 = word & 0x7F
            let payload: JsonObject = ["m": [Int(status), Int(data1), Int(data2)]]
            messages?.send(payload)
          }
          // A message is 1, 2, 3 or 4 words long, by its type.
          switch type {
          case 0, 1, 2, 6, 7: k += 1
          case 3, 4, 8, 9, 10: k += 2
          case 11, 12: k += 3
          default: k += 4
          }
        }
      }
    }
  }

  /// Raw bytes — a note, a SysEx frame — as one packet.
  private func send(_ bytes: [UInt8], to destination: MIDIEndpointRef) -> OSStatus {
    let size = 64 + bytes.count
    let raw = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: MemoryLayout<MIDIPacketList>.alignment)
    defer { raw.deallocate() }
    let list = raw.bindMemory(to: MIDIPacketList.self, capacity: 1)
    let packet = MIDIPacketListInit(list)
    guard MIDIPacketListAdd(list, size, packet, 0, bytes.count, bytes) != nil else { return -1 }
    return MIDISend(output, destination, list)
  }

  private func name(of endpoint: MIDIEndpointRef) -> String {
    var name: Unmanaged<CFString>?
    if MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &name) == noErr, let name = name {
      return name.takeRetainedValue() as String
    }
    return "MIDI device"
  }
}

@_cdecl("init_plugin_native_midi")
func initPlugin() -> Plugin {
  return NativeMidiPlugin()
}
