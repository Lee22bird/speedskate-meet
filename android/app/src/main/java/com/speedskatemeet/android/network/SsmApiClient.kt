package com.speedskatemeet.android.network

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.FormBody
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import retrofit2.Retrofit
import retrofit2.create
import java.util.concurrent.TimeUnit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

const val SSM_BASE_URL = "https://speedskatemeet.com"
private const val SESSION_COOKIE = "ssm_sess"

/**
 * Android twin of SSMCompanion's APIClient (ios/.../Services/APIClient.swift).
 *
 * SSM has NO separate mobile auth system — it reuses the website's `ssm_sess`
 * session cookie, exactly like a browser: login is a form POST to /admin/login
 * (success = the cookie landed; the redirect body is ignored), meet-PIN sign-in
 * is POST /api/v1/meet-pin/login (also sets the cookie). So instead of bearer
 * tokens (the SSL app's model), this client persists the session cookie in
 * EncryptedSharedPreferences and replays it on every request.
 */
class SsmApiClient(context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "ssm_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    /** Persists just the ssm_sess cookie value across launches. */
    private val cookieJar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            cookies.firstOrNull { it.name == SESSION_COOKIE }?.let { cookie ->
                if (cookie.value.isEmpty() || cookie.expiresAt < System.currentTimeMillis()) {
                    prefs.edit().remove(SESSION_COOKIE).apply()
                } else {
                    prefs.edit().putString(SESSION_COOKIE, cookie.value).apply()
                }
            }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val value = prefs.getString(SESSION_COOKIE, null) ?: return emptyList()
            return listOf(
                Cookie.Builder()
                    .name(SESSION_COOKIE)
                    .value(value)
                    .domain(url.host)
                    .path("/")
                    .build(),
            )
        }
    }

    private val json = Json { ignoreUnknownKeys = true }

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .cookieJar(cookieJar)
        // Don't auto-follow redirects: /admin/login answers 302 on success and
        // portal endpoints signal denial by redirecting — we want to SEE those.
        .followRedirects(false)
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl(SSM_BASE_URL)
        .client(
            // JSON endpoints never redirect on success, so give Retrofit a
            // redirect-following client; the raw client below keeps 302s visible.
            httpClient.newBuilder().followRedirects(true).build(),
        )
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    val api: SsmApiService = retrofit.create()

    fun hasSession(): Boolean = prefs.getString(SESSION_COOKIE, null) != null

    fun clearSession() = prefs.edit().remove(SESSION_COOKIE).apply()

    /**
     * Website-style login: form POST to /admin/login. Success = the ssm_sess
     * cookie landed (the endpoint replies with a redirect either way; a
     * redirect back to /admin/login means bad credentials).
     */
    suspend fun login(email: String, password: String): Boolean {
        val body = FormBody.Builder()
            .add("email", email)
            .add("password", password)
            .build()
        val request = Request.Builder()
            .url("$SSM_BASE_URL/admin/login")
            .post(body)
            .build()
        return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            httpClient.newCall(request).execute().use { response ->
                val location = response.header("Location").orEmpty()
                response.isRedirect && !location.contains("/admin/login") && hasSession()
            }
        }
    }
}
