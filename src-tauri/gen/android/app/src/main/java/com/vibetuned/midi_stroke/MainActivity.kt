package com.vibetuned.midi_stroke

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Practice is played on an instrument, not the screen: no touch for
    // minutes on end, so the screen stays on while the app is in front.
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    // The whole screen for the score: the status and navigation bars hidden,
    // back on a swipe from the edge.
    WindowCompat.getInsetsController(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
    // Edge to edge (Android 15 draws every app so), the page would run under
    // the camera cut-out on the side held sideways: keep it clear of the
    // cut-out, and of the bars while they are shown.
    val content = findViewById<android.view.View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val clear = insets.getInsets(WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.systemBars())
      view.setPadding(clear.left, clear.top, clear.right, clear.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
