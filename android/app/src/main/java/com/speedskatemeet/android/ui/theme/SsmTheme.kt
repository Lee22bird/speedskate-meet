package com.speedskatemeet.android.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * SSM's public/spectator design language, ported from SSMTheme.swift's PUBLIC
 * tokens (the calm "bubbly" surfaces the iOS phone tabs use — solid colors, no
 * speed-streak artwork, plump corners, soft mint/sky/peach accents).
 */
object SsmColors {
    val Background = Color(0xFF0F182B)      // publicBackground
    val Card = Color(0xFF1A253D)            // publicCard
    val CardSoft = Color(0xFF212D48)        // publicCardSoft
    val Border = Color.White.copy(alpha = 0.06f)

    val Sky = Color(0xFF7DD3FC)             // publicSky
    val Mint = Color(0xFF6EE7B7)            // publicMint
    val Peach = Color(0xFFFDBA74)           // publicPeach
    val Orange = Color(0xFFF97316)          // brand orange (ops accents)
    val Good = Color(0xFF1CD98A)
    val Danger = Color(0xFFFF5A5A)

    val TextPrimary = Color.White
    val Muted = Color(0xFF8A96B0)
}

object SsmType {
    val display = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Black, color = SsmColors.TextPrimary)
    val title = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.Black, color = SsmColors.TextPrimary)
    val headline = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Bold, color = SsmColors.TextPrimary)
    val body = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = SsmColors.TextPrimary)
    val caption = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = SsmColors.Muted)
    val label = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Black, color = SsmColors.Muted)
}

object SsmSpacing {
    val xs = 6.dp
    val sm = 10.dp
    val md = 16.dp
    val lg = 22.dp
}

object SsmRadius {
    val sm = 14.dp
    val md = 20.dp
    val lg = 28.dp                          // bubbleRadius — the plump public corner
}

@Composable
fun SpeedSkateMeetTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = SsmColors.Sky,
            background = SsmColors.Background,
            surface = SsmColors.Card,
        ),
        content = content,
    )
}

@Composable
fun SsmBackground(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier = modifier.fillMaxSize().background(SsmColors.Background)) { content() }
}

/** The plump "bubble card" from the iOS public redesign (SSMBubbleCard). */
fun Modifier.ssmBubbleCard(tint: Color? = null): Modifier = this
    .clip(RoundedCornerShape(SsmRadius.lg))
    .background(if (tint == null) SsmColors.Card else SsmColors.Card.copy(alpha = 1f).compositeOverBubble(tint))
    .border(1.dp, tint?.copy(alpha = 0.28f) ?: SsmColors.Border, RoundedCornerShape(SsmRadius.lg))

private fun Color.compositeOverBubble(tint: Color): Color =
    Color(
        red = red * 0.90f + tint.red * 0.10f,
        green = green * 0.90f + tint.green * 0.10f,
        blue = blue * 0.90f + tint.blue * 0.10f,
        alpha = 1f,
    )
