package com.kestrel.ledger

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.kestrel.ledger.data.AndroidProduct
import com.kestrel.ledger.data.AndroidWallet
import com.kestrel.ledger.data.ApiClient
import com.kestrel.ledger.data.FirebaseRepository
import com.kestrel.ledger.data.SharedCoinPackage
import com.kestrel.ledger.data.SharedPlanConfig
import com.kestrel.ledger.data.SharedTickerEvent
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val auth = FirebaseAuth.getInstance()
        val db = FirebaseFirestore.getInstance()
        val analytics = FirebaseAnalytics.getInstance(this)
        val repo = FirebaseRepository(auth, db, analytics)
        // Configure BASE_URL via BuildConfig or hosted Cloud Run URL in production
        val apiClient = ApiClient(baseUrl = "https://your-kestrel-cloud-run-url.run.app")

        setContent {
            var darkTheme by remember { mutableStateOf(false) }
            MaterialTheme(
                colorScheme = if (darkTheme) {
                    darkColorScheme(
                        primary = Color(0xFF3B82F6),
                        surface = Color(0xFF0F172A),
                        background = Color(0xFF020617)
                    )
                } else {
                    lightColorScheme(
                        primary = Color(0xFF1D4ED8),
                        surface = Color(0xFFFFFFFF),
                        background = Color(0xFFF8FAFC)
                    )
                }
            ) {
                KestrelAndroidApp(
                    repo = repo,
                    apiClient = apiClient,
                    darkTheme = darkTheme,
                    onToggleTheme = { darkTheme = !darkTheme }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KestrelAndroidApp(
    repo: FirebaseRepository,
    apiClient: ApiClient,
    darkTheme: Boolean,
    onToggleTheme: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val uid = repo.currentUid()
    val wallet by if (uid != null) {
        repo.observeWallet(uid).collectAsState(initial = AndroidWallet())
    } else {
        remember { mutableStateOf(AndroidWallet()) }
    }
    val products by repo.observeActiveProducts().collectAsState(initial = emptyList())

    var packages by remember { mutableStateOf<List<SharedCoinPackage>>(emptyList()) }
    var plans by remember { mutableStateOf<List<SharedPlanConfig>>(emptyList()) }
    var ticker by remember { mutableStateOf<List<SharedTickerEvent>>(emptyList()) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        runCatching {
            val (pkgs, pls, tck) = apiClient.fetchPublicBootstrap()
            packages = pkgs
            plans = pls
            ticker = tck
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Kestrel Ledger", fontWeight = FontWeight.SemiBold) },
                actions = {
                    TextButton(onClick = onToggleTheme) {
                        Text(if (darkTheme) "Light" else "Dark")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(selected = selectedTab == 0, onClick = { selectedTab = 0 }, icon = {}, label = { Text("Wallet") })
                NavigationBarItem(selected = selectedTab == 1, onClick = { selectedTab = 1 }, icon = {}, label = { Text("Plans") })
                NavigationBarItem(selected = selectedTab == 2, onClick = { selectedTab = 2 }, icon = {}, label = { Text("UPI") })
                NavigationBarItem(selected = selectedTab == 3, onClick = { selectedTab = 3 }, icon = {}, label = { Text("AI & Help") })
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            statusMessage?.let { msg ->
                Card(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
                ) {
                    Text(msg, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
                }
            }

            when (selectedTab) {
                0 -> WalletAndTickerTab(wallet = wallet, ticker = ticker, products = products, apiClient = apiClient) { msg ->
                    statusMessage = msg
                }
                1 -> PlansAndPackagesTab(
                    packages = packages,
                    plans = plans,
                    onActivatePlan = { planId ->
                        scope.launch {
                            statusMessage = runCatching { apiClient.purchase24hPlan(planId) }
                                .getOrElse { it.message ?: "Sign in required." }
                        }
                    }
                )
                2 -> SandboxUpiTab(
                    packages = packages,
                    onRequestRandomUpi = { pkgId, amount ->
                        scope.launch {
                            runCatching {
                                val intentData = apiClient.createRandomUpiIntent(pkgId, amount)
                                statusMessage = "Assigned ${intentData.assignedLabel} (${intentData.assignedUpiId}) · ${intentData.paymentId}"
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(intentData.upiUri))
                                if (intent.resolveActivity(context.packageManager) != null) {
                                    context.startActivity(intent)
                                }
                            }.onFailure {
                                statusMessage = it.message ?: "Unable to create random UPI intent."
                            }
                        }
                    }
                )
                3 -> AiAndSupportTab(
                    onAskAi = { prompt, lang ->
                        scope.launch {
                            statusMessage = runCatching { apiClient.askSmartAssistant(prompt, lang) }
                                .getOrElse { it.message ?: "AI assistant unavailable." }
                        }
                    },
                    onSubmitTicket = { cat, subj, desc ->
                        scope.launch {
                            runCatching {
                                repo.submitSupportTicket(cat, subj, desc)
                                statusMessage = "Support ticket submitted."
                            }.onFailure {
                                statusMessage = it.message ?: "Sign in required."
                            }
                        }
                    }
                )
            }
        }
    }
}

@Composable
fun WalletAndTickerTab(
    wallet: AndroidWallet,
    ticker: List<SharedTickerEvent>,
    products: List<AndroidProduct>,
    apiClient: ApiClient,
    onStatus: (String) -> Unit
) {
    var otpChannel by remember { mutableStateOf("mobile") }
    var otpIdentifier by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Coin Wallet Overview", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(8.dp))
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Available Coins: ${wallet.availableCoins}", fontWeight = FontWeight.Bold)
                    Text("Pending Coins: ${wallet.pendingCoins}")
                    Text("Total Purchased: ${wallet.totalPurchasedCoins}")
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        "Balances are server-authoritative and share the same /api/v1 ledger as Web.",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }

        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("OTP Sign In (Mobile / Email)", fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = otpChannel == "mobile", onClick = { otpChannel = "mobile" }, label = { Text("Mobile") })
                        FilterChip(selected = otpChannel == "email", onClick = { otpChannel = "email" }, label = { Text("Email") })
                    }
                    OutlinedTextField(
                        value = otpIdentifier,
                        onValueChange = { otpIdentifier = it },
                        label = { Text(if (otpChannel == "mobile") "Mobile (+91...)" else "Email address") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(onClick = {
                        scope.launch {
                            onStatus(runCatching { apiClient.requestOtp(otpChannel, otpIdentifier) }.getOrElse { it.message ?: "OTP error" })
                        }
                    }) { Text("Send OTP") }

                    OutlinedTextField(
                        value = otpCode,
                        onValueChange = { otpCode = it },
                        label = { Text("6-digit OTP") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(onClick = {
                        scope.launch {
                            onStatus(runCatching {
                                apiClient.verifyOtp(otpChannel, otpIdentifier, otpCode)
                                "OTP Verified. Shared session active."
                            }.getOrElse { it.message ?: "Verification failed" })
                        }
                    }) { Text("Verify OTP") }
                }
            }
        }

        item {
            Text("Verified Ledger Activity (No PII)", style = MaterialTheme.typography.titleMedium)
            if (ticker.isEmpty()) {
                Text("No verified coin additions or withdrawals recorded yet.", style = MaterialTheme.typography.bodySmall)
            }
        }

        items(ticker) { ev ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${ev.maskedUserId} · ${ev.verifiedLabel}", style = MaterialTheme.typography.bodySmall)
                    Text("+${ev.amountCoins} Coins", fontWeight = FontWeight.SemiBold)
                }
            }
        }

        if (products.isNotEmpty()) {
            item { Text("Catalogue", style = MaterialTheme.typography.titleMedium) }
            items(products) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(item.title, fontWeight = FontWeight.SemiBold)
                        Text("${item.category} · ${item.coinPrice} Coins · INR ${item.inrPrice}")
                    }
                }
            }
        }
    }
}

@Composable
fun PlansAndPackagesTab(
    packages: List<SharedCoinPackage>,
    plans: List<SharedPlanConfig>,
    onActivatePlan: (String) -> Unit
) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("24-Hour Scheduled Plans", style = MaterialTheme.typography.titleLarge) }
        items(plans) { plan ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(plan.name, fontWeight = FontWeight.SemiBold)
                    Text("${plan.purchasePrice} Coins · ${plan.durationDays} days · Total ${plan.totalScheduledCredits} credits · Every ${plan.creditIntervalHours}h")
                    Text(plan.description, style = MaterialTheme.typography.bodySmall)
                    Spacer(modifier = Modifier.height(6.dp))
                    Button(onClick = { onActivatePlan(plan.planId) }) {
                        Text("Activate 24h Plan")
                    }
                }
            }
        }
        item { Text("8 Coin Packages", style = MaterialTheme.typography.titleMedium) }
        items(packages) { pkg ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(pkg.name, fontWeight = FontWeight.SemiBold)
                        Text("${pkg.coinQuantity} Coins", style = MaterialTheme.typography.bodySmall)
                    }
                    Text("INR ${pkg.purchasePrice}", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun SandboxUpiTab(
    packages: List<SharedCoinPackage>,
    onRequestRandomUpi: (String?, Long?) -> Unit
) {
    var amountText by remember { mutableStateOf("500") }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Random Sandbox UPI Checkout", style = MaterialTheme.typography.titleLarge)
        Text("Backend randomly assigns an active sandbox UPI configuration per payment request. No real money is processed.")
        if (packages.isNotEmpty()) {
            Button(
                onClick = { onRequestRandomUpi(packages.first().packageId, null) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Pay Package: ${packages.first().name} (INR ${packages.first().purchasePrice})")
            }
        }
        OutlinedTextField(
            value = amountText,
            onValueChange = { amountText = it },
            label = { Text("Custom Amount (INR)") },
            modifier = Modifier.fillMaxWidth()
        )
        Button(
            onClick = { onRequestRandomUpi(null, amountText.toLongOrNull() ?: 500L) },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Create Random UPI Payment Request")
        }
    }
}

@Composable
fun AiAndSupportTab(
    onAskAi: (String, String) -> Unit,
    onSubmitTicket: (String, String, String) -> Unit
) {
    var aiPrompt by remember { mutableStateOf("") }
    var lang by remember { mutableStateOf("en") }
    var subject by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("AI Smart Assistant (EN / HI)", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = lang == "en", onClick = { lang = "en" }, label = { Text("English") })
                FilterChip(selected = lang == "hi", onClick = { lang = "hi" }, label = { Text("Hindi") })
            }
            OutlinedTextField(
                value = aiPrompt,
                onValueChange = { aiPrompt = it },
                label = { Text("Ask Kestrel AI Assistant") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(6.dp))
            Button(
                onClick = { if (aiPrompt.isNotBlank()) onAskAi(aiPrompt, lang) },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Send to Server AI") }
        }

        item {
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            Text("Support Helpdesk", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = subject,
                onValueChange = { subject = it },
                label = { Text("Subject") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(6.dp))
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Issue Description") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = {
                    if (subject.isNotBlank() && description.isNotBlank()) {
                        onSubmitTicket("Other", subject, description)
                        subject = ""
                        description = ""
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Submit Support Ticket")
            }
        }
    }
}
