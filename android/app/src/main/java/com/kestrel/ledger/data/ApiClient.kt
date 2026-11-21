package com.kestrel.ledger.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

data class SharedCoinPackage(
    val packageId: String,
    val name: String,
    val coinQuantity: Long,
    val purchasePrice: Long,
    val currency: String,
    val description: String
)

data class SharedPlanConfig(
    val planId: String,
    val name: String,
    val purchasePrice: Long,
    val durationDays: Int,
    val totalScheduledCredits: Long,
    val creditIntervalHours: Int,
    val description: String
)

data class SharedTickerEvent(
    val eventId: String,
    val maskedUserId: String,
    val eventType: String,
    val amountCoins: Long,
    val verifiedLabel: String,
    val timestampIso: String
)

data class RandomUpiIntentResult(
    val paymentId: String,
    val assignedLabel: String,
    val assignedUpiId: String,
    val upiUri: String,
    val coinsRequested: Long
)

/**
 * Shared REST API client matching the Web & Node/Express /api/v1/* contract.
 * Uses standard HttpURLConnection + org.json so Web and Android share identical
 * OTP auth, wallet balances, random sandbox UPI assignment, 24h plan schedules,
 * real verified activity ticker, and server-side Gemini AI endpoints.
 */
class ApiClient(private val baseUrl: String) {
    var sessionBearerToken: String? = null

    private suspend fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null
    ): JSONObject = withContext(Dispatchers.IO) {
        val url = URL("${baseUrl.trimEnd('/')}$path")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 12000
            readTimeout = 20000
            setRequestProperty("Content-Type", "application/json")
            sessionBearerToken?.let { token ->
                setRequestProperty("Authorization", "Bearer $token")
            }
            if (body != null) {
                doOutput = true
                OutputStreamWriter(outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(body.toString())
                }
            }
        }

        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.let {
            BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use { r -> r.readText() }
        } ?: "{}"

        val json = JSONObject(if (text.isBlank()) "{}" else text)
        if (status !in 200..299) {
            val msg = json.optString("error", "API error $status")
            throw IllegalStateException(msg)
        }
        json
    }

    suspend fun requestOtp(channel: String, identifier: String, mode: String = "login"): String {
        val payload = JSONObject()
            .put("channel", channel)
            .put("identifier", identifier)
            .put("mode", mode)
        val res = request("/api/v1/auth/otp/request", "POST", payload)
        return res.optString("sandboxNotice", "OTP generated on server.")
    }

    suspend fun verifyOtp(channel: String, identifier: String, otp: String): String {
        val payload = JSONObject()
            .put("channel", channel)
            .put("identifier", identifier)
            .put("otp", otp)
        val res = request("/api/v1/auth/otp/verify", "POST", payload)
        val token = res.getString("token")
        sessionBearerToken = token
        return token
    }

    suspend fun fetchPublicBootstrap(): Triple<List<SharedCoinPackage>, List<SharedPlanConfig>, List<SharedTickerEvent>> {
        val res = request("/api/v1/public/bootstrap", "GET")

        val pkgArr = res.optJSONArray("coinPackages")
        val packages = buildList {
            if (pkgArr != null) {
                for (i in 0 until pkgArr.length()) {
                    val o = pkgArr.getJSONObject(i)
                    if (o.optString("status") == "active") {
                        add(
                            SharedCoinPackage(
                                packageId = o.getString("packageId"),
                                name = o.getString("name"),
                                coinQuantity = o.getLong("coinQuantity"),
                                purchasePrice = o.getLong("purchasePrice"),
                                currency = o.optString("currency", "INR"),
                                description = o.optString("description", "")
                            )
                        )
                    }
                }
            }
        }

        val planArr = res.optJSONArray("plans")
        val plans = buildList {
            if (planArr != null) {
                for (i in 0 until planArr.length()) {
                    val o = planArr.getJSONObject(i)
                    if (o.optString("status") == "active") {
                        add(
                            SharedPlanConfig(
                                planId = o.getString("planId"),
                                name = o.getString("name"),
                                purchasePrice = o.getLong("purchasePrice"),
                                durationDays = o.getInt("durationDays"),
                                totalScheduledCredits = o.getLong("totalScheduledCredits"),
                                creditIntervalHours = o.optInt("creditIntervalHours", 24),
                                description = o.optString("description", "")
                            )
                        )
                    }
                }
            }
        }

        val tickerArr = res.optJSONArray("ticker")
        val ticker = buildList {
            if (tickerArr != null) {
                for (i in 0 until tickerArr.length()) {
                    val o = tickerArr.getJSONObject(i)
                    add(
                        SharedTickerEvent(
                            eventId = o.getString("eventId"),
                            maskedUserId = o.getString("maskedUserId"),
                            eventType = o.getString("eventType"),
                            amountCoins = o.getLong("amountCoins"),
                            verifiedLabel = o.getString("verifiedLabel"),
                            timestampIso = o.getString("timestampIso")
                        )
                    )
                }
            }
        }

        return Triple(packages, plans, ticker)
    }

    suspend fun createRandomUpiIntent(packageId: String?, amountInr: Long?): RandomUpiIntentResult {
        val payload = JSONObject()
            .put("upiApp", "QR Sandbox")
            .put("idempotencyKey", "and_${UUID.randomUUID().toString().take(12)}")
        if (packageId != null) payload.put("packageId", packageId)
        if (amountInr != null) payload.put("amountInr", amountInr)

        val res = request("/api/v1/payments/create-intent", "POST", payload)
        val payment = res.getJSONObject("payment")
        val assigned = res.getJSONObject("assignedConfig")
        return RandomUpiIntentResult(
            paymentId = payment.getString("paymentId"),
            assignedLabel = assigned.getString("label"),
            assignedUpiId = assigned.getString("upiId"),
            upiUri = res.getString("upiUri"),
            coinsRequested = payment.getLong("coinsRequested")
        )
    }

    suspend fun purchase24hPlan(planId: String): String {
        val payload = JSONObject().put("planId", planId)
        val res = request("/api/v1/plans/purchase", "POST", payload)
        val purchase = res.getJSONObject("purchase")
        return "Activated ${purchase.getString("planName")} (${purchase.getInt("durationDays")} days · 24h cycle)"
    }

    suspend fun askSmartAssistant(message: String, language: String = "en"): String {
        val payload = JSONObject()
            .put("message", message)
            .put("language", language)
        val res = request("/api/v1/ai/smart-assistant", "POST", payload)
        val result = res.getJSONObject("result")
        return result.optString("reply", "No response.")
    }
}
