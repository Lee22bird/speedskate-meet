@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.speedskatemeet.android.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.padding
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.speedskatemeet.android.ui.live.LiveScreen
import com.speedskatemeet.android.ui.meets.MeetsScreen
import com.speedskatemeet.android.ui.results.ResultsScreen
import com.speedskatemeet.android.ui.coach.CoachToolsScreen
import com.speedskatemeet.android.ui.staff.ProtestsScreen
import com.speedskatemeet.android.ui.staff.StaffRaceDayScreen
import com.speedskatemeet.android.ui.staff.StaffScreen
import com.speedskatemeet.android.ui.theme.SsmColors

/** Same four tabs as the SSM iOS companion (RootTabView.swift): Meets / Live / Results / Staff. */
sealed class SsmTab(val route: String, val label: String) {
    data object Meets : SsmTab("meets", "Meets")
    data object Live : SsmTab("live", "Live")
    data object Results : SsmTab("results", "Results")
    data object Staff : SsmTab("staff", "Staff")
}

private val tabs = listOf(SsmTab.Meets, SsmTab.Live, SsmTab.Results, SsmTab.Staff)

@Composable
fun SsmNavHost() {
    val navController = rememberNavController()

    Scaffold(
        containerColor = SsmColors.Background,
        bottomBar = {
            NavigationBar(containerColor = SsmColors.Card) {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination
                tabs.forEach { tab ->
                    val selected = currentDestination?.hierarchy?.any { it.route == tab.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(tab.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            val icon = when (tab) {
                                SsmTab.Meets -> Icons.Filled.Search
                                SsmTab.Live -> Icons.Filled.Sensors
                                SsmTab.Results -> Icons.Filled.FormatListNumbered
                                SsmTab.Staff -> Icons.Filled.VerifiedUser
                            }
                            Icon(icon, contentDescription = tab.label)
                        },
                        label = { Text(tab.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = SsmColors.Orange,
                            selectedTextColor = SsmColors.Orange,
                            unselectedIconColor = SsmColors.Muted,
                            unselectedTextColor = SsmColors.Muted,
                            indicatorColor = SsmColors.CardSoft,
                        ),
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = SsmTab.Meets.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(SsmTab.Meets.route) { MeetsScreen(navController) }
            composable(SsmTab.Live.route) { LiveScreen(navController, meetId = null, meetName = null) }
            composable(SsmTab.Results.route) { ResultsScreen(navController, meetId = null, meetName = null) }
            composable(SsmTab.Staff.route) { StaffScreen(navController) }

            composable(
                "live/{meetId}?name={name}",
                arguments = listOf(
                    navArgument("meetId") { type = NavType.StringType },
                    navArgument("name") { type = NavType.StringType; defaultValue = "" },
                ),
            ) { entry ->
                DetailScaffold(
                    title = entry.arguments?.getString("name").orEmpty().ifEmpty { "Live" },
                    navController = navController,
                ) {
                    LiveScreen(
                        navController,
                        meetId = entry.arguments?.getString("meetId"),
                        meetName = entry.arguments?.getString("name"),
                    )
                }
            }
            composable(
                "staffday/{meetId}?name={name}",
                arguments = listOf(
                    navArgument("meetId") { type = NavType.StringType },
                    navArgument("name") { type = NavType.StringType; defaultValue = "" },
                ),
            ) { entry ->
                DetailScaffold(
                    title = entry.arguments?.getString("name").orEmpty().ifEmpty { "Race Day" },
                    navController = navController,
                ) {
                    StaffRaceDayScreen(
                        navController,
                        meetId = entry.arguments?.getString("meetId").orEmpty(),
                        meetName = entry.arguments?.getString("name").orEmpty(),
                    )
                }
            }
            composable(
                "protests/{meetId}?name={name}",
                arguments = listOf(
                    navArgument("meetId") { type = NavType.StringType },
                    navArgument("name") { type = NavType.StringType; defaultValue = "" },
                ),
            ) { entry ->
                DetailScaffold(title = "Protests", navController = navController) {
                    ProtestsScreen(meetId = entry.arguments?.getString("meetId").orEmpty())
                }
            }
            composable(
                "coach/{meetId}?name={name}",
                arguments = listOf(
                    navArgument("meetId") { type = NavType.StringType },
                    navArgument("name") { type = NavType.StringType; defaultValue = "" },
                ),
            ) { entry ->
                DetailScaffold(
                    title = entry.arguments?.getString("name").orEmpty().ifEmpty { "Coach Tools" },
                    navController = navController,
                ) {
                    CoachToolsScreen(meetId = entry.arguments?.getString("meetId").orEmpty())
                }
            }
            composable(
                "results/{meetId}?name={name}",
                arguments = listOf(
                    navArgument("meetId") { type = NavType.StringType },
                    navArgument("name") { type = NavType.StringType; defaultValue = "" },
                ),
            ) { entry ->
                DetailScaffold(
                    title = entry.arguments?.getString("name").orEmpty().ifEmpty { "Results" },
                    navController = navController,
                ) {
                    ResultsScreen(
                        navController,
                        meetId = entry.arguments?.getString("meetId"),
                        meetName = entry.arguments?.getString("name"),
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailScaffold(
    title: String,
    navController: NavHostController,
    content: @Composable () -> Unit,
) {
    Scaffold(
        containerColor = SsmColors.Background,
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = SsmColors.Background,
                    titleContentColor = SsmColors.TextPrimary,
                    navigationIconContentColor = SsmColors.TextPrimary,
                ),
            )
        },
    ) { padding ->
        androidx.compose.foundation.layout.Box(Modifier.padding(padding)) { content() }
    }
}
