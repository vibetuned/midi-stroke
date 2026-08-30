// Throwaway probe: does midir's own output-connection port show up as an
// INPUT port (ALSA READ|SUBS_READ), and does the connect-everything input
// bridge then read back what we send? (The suspected key-light loop.)
fn main() {
    // 1. Open the lights output exactly like midi_send does.
    let out = midir::MidiOutput::new("midi-stroke-out").unwrap();
    let port = out
        .ports()
        .into_iter()
        .find(|p| out.port_name(p).map(|n| n.to_lowercase().contains("roli")).unwrap_or(false))
        .expect("no ROLI output");
    let mut conn = out.connect(&port, "midi-stroke-lights").unwrap();

    // 2. Enumerate input ports like spawn_midi's probe does.
    let probe = midir::MidiInput::new("midi-stroke-probe").unwrap();
    println!("input ports as seen by the bridge:");
    let mut own_port = None;
    for p in probe.ports() {
        let name = probe.port_name(&p).unwrap_or_default();
        let own = name.contains("midi-stroke");
        println!("  {}{}", name, if own { "   <-- OUR OWN OUTPUT" } else { "" });
        if own { own_port = Some(p); }
    }

    // 3. Subscribe to our own port (as the connect-everything loop would)
    //    and see whether a sent note-on comes back.
    let Some(own_port) = own_port else { println!("no own port listed — no loop"); return; };
    let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
    let inp = {
        let mut i = midir::MidiInput::new("midi-stroke").unwrap();
        i.ignore(midir::Ignore::None);
        i.connect(&own_port, "midi-stroke-in", move |_t, m, _| { let _ = tx.send(m.to_vec()); }, ()).unwrap()
    };
    std::thread::sleep(std::time::Duration::from_millis(100));
    conn.send(&[0x90, 60, 100]).unwrap();
    match rx.recv_timeout(std::time::Duration::from_millis(500)) {
        Ok(m) => println!("LOOP CONFIRMED: sent [90 3C 64], read back {:02X?}", m),
        Err(_) => println!("no loopback within 500ms"),
    }
    drop(inp);
}
