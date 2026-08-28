package com.speedskatemeet.android.network

import retrofit2.http.Body
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
}
