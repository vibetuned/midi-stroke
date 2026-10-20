package com.vibetuned.midistroke.nativemidi

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiInputPort
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.widget.ArrayAdapter
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.UUID

@InvokeArg
class StartArgs {
    lateinit var messages: Channel
    lateinit var devices: Channel
}

@InvokeArg
class SendArgs {
    var portMatch: String = ""
    var data: IntArray = IntArray(0)
}

/** The Bluetooth LE MIDI service every BLE MIDI instrument advertises. */
private val MIDI_SERVICE: UUID = UUID.fromString("03B80E5A-EDE8-4B33-A751-6CE34EC4C700")

/**
 * MIDI for Midi Stroke on Android (android.media.midi): every device is
 * opened — USB as it is plugged in, Bluetooth once connected from
 * `bluetooth` — each of its sources read, its messages sent to the shell
 * (src/mobile.rs) as [status, data1, data2], its destinations kept for `send`.
 * Everything that touches the devices runs on the main thread.
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT], alias = "bluetooth"),
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "location"),
    ]
)
class NativeMidiPlugin(private val activity: Activity) : Plugin(activity) {
    private val main = Handler(Looper.getMainLooper())
    private val midi: MidiManager? by lazy { activity.getSystemService(Context.MIDI_SERVICE) as? MidiManager }

    /** An open device: its name, the sources read, the destinations by label. */
    private class Opened(
        val device: MidiDevice,
        val name: String,
        val sources: List<MidiOutputPort>,
        val destinations: List<Pair<String, MidiInputPort>>,
    ) {
        fun close() {
            sources.forEach { runCatching { it.close() } }
            destinations.forEach { runCatching { it.second.close() } }
            runCatching { device.close() }
        }
    }

    private val opened = HashMap<Int, Opened>()
    private val opening = HashSet<Int>()
    /** Bluetooth connections: held open while the app is. */
    private val bluetooth = ArrayList<MidiDevice>()
    @Volatile private var messages: Channel? = null
    @Volatile private var devices: Channel? = null
    private var listening = false

    private val callback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) = open(info)
        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            opened.remove(info.id)?.close()
            publish()
        }
    }

    @Command
    fun start(invoke: Invoke) {
        val args = invoke.parseArgs(StartArgs::class.java)
        main.post {
            messages = args.messages
            devices = args.devices
            val manager = midi
            if (manager != null && !listening) {
                listening = true
                @Suppress("DEPRECATION")
                manager.registerDeviceCallback(callback, main)
                deviceInfos(manager).forEach { open(it) }
            }
            publish()
            invoke.resolve()
        }
    }

    @Command
    fun outputs(invoke: Invoke) {
        main.post {
            val names = JSArray()
            opened.values.flatMap { it.destinations }.forEach { names.put(it.first) }
            invoke.resolve(JSObject().put("names", names))
        }
    }

    @Command
    fun send(invoke: Invoke) {
        val args = invoke.parseArgs(SendArgs::class.java)
        val needles = args.portMatch.split('|').map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        main.post {
            val port = opened.values.flatMap { it.destinations }
                .firstOrNull { (label, _) -> needles.any { label.lowercase().contains(it) } }?.second
            if (port == null) {
                invoke.reject("no MIDI output matching '${args.portMatch}'")
                return@post
            }
            val bytes = ByteArray(args.data.size) { args.data[it].toByte() }
            try {
                port.send(bytes, 0, bytes.size)
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: "MIDI send failed")
            }
        }
    }

    @Command
    fun bluetooth(invoke: Invoke) {
        val alias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetooth" else "location"
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, invoke, "bluetoothPermission")
            return
        }
        main.post { scan(invoke) }
    }

    @PermissionCallback
    private fun bluetoothPermission(invoke: Invoke) {
        val alias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetooth" else "location"
        if (getPermissionState(alias) == PermissionState.GRANTED) main.post { scan(invoke) }
        else invoke.reject("Bluetooth permission denied")
    }

    /** The Bluetooth MIDI instruments in range, as they are found; one tapped is connected. */
    @SuppressLint("MissingPermission")
    private fun scan(invoke: Invoke) {
        val adapter = (activity.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
        val scanner = adapter?.bluetoothLeScanner
        if (adapter == null || !adapter.isEnabled || scanner == null) {
            invoke.reject("Bluetooth is off")
            return
        }
        val found = ArrayList<BluetoothDevice>()
        val names = ArrayAdapter<String>(activity, android.R.layout.simple_list_item_1, ArrayList())
        val results = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                main.post {
                    val device = result.device
                    if (found.none { it.address == device.address }) {
                        found.add(device)
                        names.add(device.name ?: result.scanRecord?.deviceName ?: device.address)
                    }
                }
            }
        }
        val stop = { runCatching { scanner.stopScan(results) } }
        AlertDialog.Builder(activity)
            .setTitle("Bluetooth MIDI — looking for instruments…")
            .setAdapter(names) { _, which ->
                stop()
                connect(found[which])
            }
            .setNegativeButton(android.R.string.cancel, null)
            .setOnDismissListener { stop() }
            .show()
        scanner.startScan(
            listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(MIDI_SERVICE)).build()),
            ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
            results,
        )
        invoke.resolve()
    }

    private fun connect(device: BluetoothDevice) {
        midi?.openBluetoothDevice(device, { connected ->
            if (connected == null) return@openBluetoothDevice
            bluetooth.add(connected)
            // It is listed as a device too; read it here if that has not opened it already.
            val id = connected.info.id
            if (!opened.containsKey(id) && !opening.contains(id)) attach(connected.info, connected)
        }, main)
    }

    @Suppress("DEPRECATION")
    private fun deviceInfos(manager: MidiManager): List<MidiDeviceInfo> =
        if (Build.VERSION.SDK_INT >= 33) manager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM).toList()
        else manager.devices.toList()

    private fun open(info: MidiDeviceInfo) {
        if (opened.containsKey(info.id) || !opening.add(info.id)) return
        midi?.openDevice(info, { device ->
            opening.remove(info.id)
            if (device != null && !opened.containsKey(info.id)) attach(info, device)
        }, main) ?: opening.remove(info.id)
    }

    private fun attach(info: MidiDeviceInfo, device: MidiDevice) {
        val name = info.properties.getString(MidiDeviceInfo.PROPERTY_NAME)
            ?: info.properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
            ?: "MIDI device"
        // A device's output ports are what it plays (our sources); its input ports, what it is played (our destinations).
        val sources = (0 until info.outputPortCount).mapNotNull { i -> device.openOutputPort(i)?.also { it.connect(Reader()) } }
        val inputs = info.ports.filter { it.type == MidiDeviceInfo.PortInfo.TYPE_INPUT }
        val destinations = inputs.mapNotNull { p ->
            val label = if (inputs.size > 1 && p.name.isNotEmpty()) "$name ${p.name}" else name
            device.openInputPort(p.portNumber)?.let { label to it }
        }
        opened[info.id] = Opened(device, name, sources, destinations)
        publish()
    }

    /** The sources' names, to the shell's "midi-devices". */
    private fun publish() {
        val names = JSArray()
        opened.values.filter { it.sources.isNotEmpty() }.forEach { names.put(it.name) }
        devices?.send(JSObject().put("names", names))
    }

    private fun emit(status: Int, data1: Int, data2: Int) {
        messages?.send(JSObject().put("m", JSArray().put(status).put(data1).put(data2)))
    }

    /**
     * A source's bytes, as messages: channel voice messages only, running
     * status followed; clock, active sensing, SysEx and the rest left out —
     * as the desktop bridge does.
     */
    private inner class Reader : MidiReceiver() {
        private var status = 0
        private var need = 0
        private var count = 0
        private val data = IntArray(2)
        private var sysex = false

        override fun onSend(msg: ByteArray, offset: Int, length: Int, timestamp: Long) {
            for (k in offset until offset + length) {
                val b = msg[k].toInt() and 0xFF
                when {
                    b >= 0xF8 -> {}
                    b == 0xF0 -> { sysex = true; status = 0 }
                    b == 0xF7 -> sysex = false
                    b >= 0xF0 -> { sysex = false; status = 0 }
                    b >= 0x80 -> {
                        sysex = false
                        status = b
                        count = 0
                        need = if ((b and 0xF0) == 0xC0 || (b and 0xF0) == 0xD0) 1 else 2
                    }
                    sysex || status == 0 -> {}
                    else -> {
                        data[count++] = b
                        if (count == need) {
                            emit(status, data[0], if (need == 2) data[1] else 0)
                            count = 0
                        }
                    }
                }
            }
        }
    }
}
