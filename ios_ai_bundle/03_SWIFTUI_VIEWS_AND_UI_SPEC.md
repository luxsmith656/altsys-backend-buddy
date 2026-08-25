# 03. SWIFTUI VIEWS & UI COMPONENT IMPLEMENTATION SPECIFICATION
## Native SwiftUI Components for iOS

---

## 1. `EndHikeSettlementView.swift` (Payment Check & Change Calculator)
```swift
import SwiftUI

public struct EndHikeSettlementView: View {
    public let booking: Booking
    public let onHikeCompleted: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var cashTenderedText: String = ""
    @State private var returnedHeadcount: Int = 1
    @State private var isHeadcountVerified: Bool = true
    @State private var isSubmitting: Bool = false

    private var feeBreakdown: FeeBreakdown {
        let meta = booking.parsedMeta
        return PaymentCalculationService.shared.calculateFees(
            groupSize: booking.groupSize,
            peakHours: meta.peakExtensionHours ?? 0,
            horseCount: meta.emergencyHorseCount ?? 0
        )
    }

    private var alreadyPaid: Double {
        let meta = booking.parsedMeta
        if booking.paymentStatus == "paid" { return feeBreakdown.grandTotalFee }
        return meta.amountPaid ?? 0.0
    }

    private var remainingBalance: Double {
        max(0.0, feeBreakdown.grandTotalFee - alreadyPaid)
    }

    private var isOnlineSettled: Bool {
        let meta = booking.parsedMeta
        return (meta.paymentMethod == "gcash" || meta.paymentMethod == "bank_transfer") && (booking.paymentStatus == "paid" || remainingBalance == 0)
    }

    private var cashTendered: Double {
        Double(cashTenderedText) ?? 0.0
    }

    private var changeCalculation: (balanceDue: Double, change: Double, isSufficient: Bool) {
        PaymentCalculationService.shared.calculateChange(
            cashTendered: cashTendered,
            totalDue: feeBreakdown.grandTotalFee,
            alreadyPaid: alreadyPaid
        )
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    // Header Card
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(booking.parsedMeta.fullName ?? "Hiker Lead")
                                .font(.headline)
                            Spacer()
                            Text("\(booking.groupSize) Pax")
                                .font(.caption.bold())
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Color.green.opacity(0.15))
                                .foregroundColor(.green)
                                .clipShape(Capsule())
                        }
                        Text("Booking Date: \(booking.bookingDate)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    // Headcount Verification
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Trailhead Closeout Verification")
                            .font(.subheadline.bold())
                        Toggle(isOn: $isHeadcountVerified) {
                            Text("All \(booking.groupSize) hikers returned safely")
                                .font(.footnote)
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    // Fee Breakdown Card
                    VStack(alignment: .leading, spacing: 10) {
                        Text("FEE BREAKDOWN")
                            .font(.caption.bold())
                            .foregroundColor(.secondary)

                        HStack {
                            Text("Tour Guide Fee (\(feeBreakdown.guidesNeeded) guide)")
                            Spacer()
                            Text(PaymentCalculationService.shared.formatPeso(feeBreakdown.guideFee))
                        }
                        .font(.footnote)

                        HStack {
                            Text("Registration & Environment (\(booking.groupSize) × ₱30)")
                            Spacer()
                            Text(PaymentCalculationService.shared.formatPeso(feeBreakdown.totalRegFee))
                        }
                        .font(.footnote)

                        if feeBreakdown.peakExtensionFee > 0 {
                            HStack {
                                Text("Peak Stay Extension")
                                Spacer()
                                Text(PaymentCalculationService.shared.formatPeso(feeBreakdown.peakExtensionFee))
                            }
                            .font(.footnote)
                            .foregroundColor(.orange)
                        }

                        Divider()

                        HStack {
                            Text("Total Amount Due")
                                .font(.subheadline.bold())
                            Spacer()
                            Text(PaymentCalculationService.shared.formatPeso(feeBreakdown.grandTotalFee))
                                .font(.headline.bold())
                                .foregroundColor(.green)
                        }

                        if alreadyPaid > 0 {
                            HStack {
                                Text("Already Paid")
                                Spacer()
                                Text("-\(PaymentCalculationService.shared.formatPeso(alreadyPaid))")
                                    .foregroundColor(.green)
                            }
                            .font(.footnote)
                        }

                        HStack {
                            Text("Balance Due:")
                                .font(.subheadline.bold())
                            Spacer()
                            Text(PaymentCalculationService.shared.formatPeso(remainingBalance))
                                .font(.title3.bold())
                                .foregroundColor(.green)
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    // Settlement Options
                    if isOnlineSettled || remainingBalance == 0 {
                        // Case A: Online Paid
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundColor(.green)
                                Text("Paid Online — Zero Balance")
                                    .font(.subheadline.bold())
                                    .foregroundColor(.green)
                            }
                            Text("All trail fees were settled online. No cash collection required.")
                                .font(.footnote)
                                .foregroundColor(.secondary)
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.green.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    } else {
                        // Case B: Onsite Cash & Change
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Onsite Cash & Change Calculator")
                                .font(.subheadline.bold())

                            VStack(alignment: .leading, spacing: 4) {
                                Text("Cash Tendered (₱)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                TextField("0.00", text: $cashTenderedText)
                                    .keyboardType(.decimalPad)
                                    .font(.title2.bold())
                                    .padding()
                                    .background(Color(.systemBackground))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }

                            // Change Output Box
                            HStack {
                                Text(changeCalculation.isSufficient ? "Change to return:" : "Shortage:")
                                    .font(.headline)
                                Spacer()
                                Text(PaymentCalculationService.shared.formatPeso(abs(changeCalculation.change)))
                                    .font(.title2.bold())
                                    .foregroundColor(changeCalculation.isSufficient ? .green : .red)
                            }
                            .padding()
                            .background(changeCalculation.isSufficient ? Color.green.opacity(0.15) : Color.red.opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .padding()
                        .background(Color.orange.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }

                    // Complete Button
                    Button(action: completeHike) {
                        HStack {
                            if isSubmitting {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "flag.checkered")
                                Text(isOnlineSettled || remainingBalance == 0 ? "Complete Hike Session" : "Collect Cash & Complete Hike")
                            }
                        }
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background((changeCalculation.isSufficient && isHeadcountVerified) ? Color.green : Color.gray)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(!changeCalculation.isSufficient || !isHeadcountVerified || isSubmitting)
                }
                .padding()
            }
            .navigationTitle("End Hike Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func completeHike() {
        isSubmitting = true
        // Updates Supabase booking status to 'completed' and session to 'completed'
        onHikeCompleted()
        dismiss()
    }
}
```

---

## 2. `QRCheckInScannerView.swift` (Native AVFoundation Camera)
```swift
import SwiftUI
import AVFoundation

public struct QRCheckInScannerView: View {
    @State private var scannedCode: String?
    @State private var isTorchOn: Bool = false
    public let onCodeScanned: (String) -> Void

    public var body: some View {
        ZStack {
            QRCodeCameraScannerRepresentable(scannedCode: $scannedCode) { code in
                onCodeScanned(code)
            }
            .ignoresSafeArea()

            // Aiming Box
            VStack {
                Spacer()
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Color.green, lineWidth: 3)
                    .frame(width: 260, height: 260)
                    .overlay(
                        Image(systemName: "viewfinder")
                            .font(.system(size: 60))
                            .foregroundColor(.green.opacity(0.5))
                    )
                Text("Align Hiker QR Permit inside frame")
                    .font(.footnote.bold())
                    .foregroundColor(.white)
                    .padding(.top, 16)
                Spacer()
            }
        }
    }
}

struct QRCodeCameraScannerRepresentable: UIViewControllerRepresentable {
    @Binding var scannedCode: String?
    var onCodeFound: (String) -> Void

    func makeUIViewController(context: Context) -> ScannerViewController {
        let controller = ScannerViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: ScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        var parent: QRCodeCameraScannerRepresentable

        init(parent: QRCodeCameraScannerRepresentable) {
            self.parent = parent
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
            if let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
               let stringValue = metadataObject.stringValue {
                DispatchQueue.main.async {
                    self.parent.scannedCode = stringValue
                    self.parent.onCodeFound(stringValue)
                }
            }
        }
    }
}

class ScannerViewController: UIViewController {
    var captureSession: AVCaptureSession!
    var previewLayer: AVCaptureVideoPreviewLayer!
    weak var delegate: AVCaptureMetadataOutputObjectsDelegate?

    override func viewDidLoad() {
        super.viewDidLoad()
        captureSession = AVCaptureSession()

        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video) else { return }
        guard let videoInput = try? AVCaptureDeviceInput(device: videoCaptureDevice) else { return }

        if captureSession.canAddInput(videoInput) {
            captureSession.addInput(videoInput)
        }

        let metadataOutput = AVCaptureMetadataOutput()
        if captureSession.canAddOutput(metadataOutput) {
            captureSession.addOutput(metadataOutput)
            metadataOutput.setDelegate(delegate, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [.qr]
        }

        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.frame = view.layer.bounds
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)

        DispatchQueue.global(qos: .background).async {
            self.captureSession.startRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.layer.bounds
    }
}
```

---

## 3. `TrailMap2D3DView.swift` (MapKit + 3D Elevation)
```swift
import SwiftUI
import MapKit

public struct TrailMap2D3DView: View {
    @State private var position: MapCameraPosition = .camera(
        MapCamera(
            centerCoordinate: CLLocationCoordinate2D(latitude: 14.1356, longitude: 121.3414),
            distance: 4000,
            pitch: 55, // 3D Tilt perspective
            heading: 45
        )
    )
    @StateObject private var tracker = LocationTrackingService.shared

    public var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Map(position: $position) {
                UserAnnotation()
                
                // Summit Marker
                Annotation("Mt. Kalisungan Summit", coordinate: CLLocationCoordinate2D(latitude: 14.1389, longitude: 121.3458)) {
                    VStack(spacing: 2) {
                        Image(systemName: "flag.fill")
                            .foregroundColor(.white)
                            .padding(8)
                            .background(Color.green)
                            .clipShape(Circle())
                        Text("760m Summit")
                            .font(.caption2.bold())
                            .padding(4)
                            .background(.ultraThinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
            .mapStyle(.hybrid(elevation: .realistic))
            
            // Map Action Controls
            VStack(spacing: 12) {
                Button(action: {
                    withAnimation {
                        position = .camera(
                            MapCamera(
                                centerCoordinate: CLLocationCoordinate2D(latitude: 14.1356, longitude: 121.3414),
                                distance: 2500,
                                pitch: 65,
                                heading: 45
                            )
                        )
                    }
                }) {
                    Image(systemName: "mountain.2.fill")
                        .padding(12)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
            }
            .padding()
        }
    }
}
```
