package com.speedskatemeet.android.network

import retrofit2.http.Body
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** The phone-companion slice of SSM's /api/v1 surface (mirrors APIClient.swift). */
interface SsmApiService {
    @GET("/api/v1/me")
    suspend fun me(): MeResponse

    @GET("/api/v1/meets")
    suspend fun meets(): MeetsResponse

    @GET("/api/v1/meets/{id}")
    suspend fun meetDetail(@Path("id") id: String): MeetDetailResponse

    @GET("/api/v1/meets/{id}/live")
    suspend fun live(@Path("id") id: String): LiveRaceDayResponse

    @GET("/api/v1/meets/{id}/results")
    suspend fun results(@Path("id") id: String): ResultsResponse

    @GET("/api/v1/my-staff-meets")
    suspend fun myStaffMeets(): MyStaffMeetsResponse

    // Meet PIN sign-in (account-free staff access; sets the ssm_sess cookie)
    @GET("/api/v1/meet-pin/meets")
    suspend fun meetPinMeets(): MeetPinMeetsResponse

    @POST("/api/v1/meet-pin/login")
    suspend fun meetPinLogin(@Body body: MeetPinLoginRequest): MeetPinLoginResponse

    // ── Staff race day ───────────────────────────────────────────────────
    @GET("/api/v1/meets/{id}/race-day-state")
    suspend fun raceDayState(@Path("id") id: String): RaceDayStateResponse

    // Director controls — the website's existing Director-panel endpoints
    // (same ones the iOS client posts to; no /api/v1 prefix).
    @POST("/api/meet/{id}/race-day/set-current")
    suspend fun setCurrentRace(@Path("id") id: String, @Body body: SetCurrentRaceRequest): SimpleOkResponse

    @POST("/api/meet/{id}/race-day/step")
    suspend fun stepRace(@Path("id") id: String, @Body body: StepRaceRequest): SimpleOkResponse

    @POST("/api/meet/{id}/race-day/toggle-pause")
    suspend fun togglePause(@Path("id") id: String): SimpleOkResponse

    @POST("/api/meet/{id}/race-day/unlock-race")
    suspend fun unlockRace(@Path("id") id: String, @Body body: UnlockRaceRequest): SimpleOkResponse

    // ── Protests (officials inbox) ───────────────────────────────────────
    @GET("/api/v1/meets/{id}/protests")
    suspend fun protests(@Path("id") id: String): ProtestsResponse

    @FormUrlEncoded
    @POST("/api/v1/meets/{id}/protests/{pid}/rule")
    suspend fun ruleProtest(
        @Path("id") id: String,
        @Path("pid") protestId: String,
        @Field("state") state: String,
        @Field("ruling") ruling: String,
    ): ProtestRuleResponse

    @FormUrlEncoded
    @POST("/api/v1/meets/{id}/protests/{pid}/fee")
    suspend fun collectProtestFee(
        @Path("id") id: String,
        @Path("pid") protestId: String,
        @Field("_") placeholder: String = "1",
    ): ProtestActionResponse

    // ── Coach: protest filing + relay builder ────────────────────────────
    @GET("/api/v1/my-coach-meets")
    suspend fun myCoachMeets(): CoachMeetsResponse

    @GET("/api/v1/meets/{id}/coach/protest-form")
    suspend fun coachProtestForm(@Path("id") id: String): CoachProtestForm

    @FormUrlEncoded
    @POST("/api/v1/meets/{id}/coach/protest")
    suspend fun fileCoachProtest(
        @Path("id") id: String,
        @Field("category") category: String,
        @Field("raceId") raceId: String,
        @Field("raceLabel") raceLabel: String,
        @Field("registrationId") registrationId: String,
        @Field("statement") statement: String,
    ): CoachProtestFiled

    @GET("/api/v1/meets/{id}/coach/relay-builder")
    suspend fun coachRelayBuilder(@Path("id") id: String): CoachRelayBuilderData

    @POST("/api/v1/meets/{id}/coach/relay-builder/teams")
    suspend fun saveCoachRelayTeams(@Path("id") id: String, @Body body: SaveRelayTeamsRequest): RelayTeamsResponse
}
