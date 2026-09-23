import Foundation
import CryptoKit

struct WorkoutCloudError: Error, LocalizedError {
    let code: String
    var errorDescription: String? { code }
}

struct WorkoutEnvelope: Codable, Equatable, Sendable {
    let version: Int
    let key: String
    let kind: String
    let id: String
    let revision: String
    let deleted: Bool
    let value: String?

    var recordName: String {
        SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func validate() throws {
        guard version == 1, ["brands", "machines", "sets", "bodyweights"].contains(kind),
              !id.isEmpty, key == "\(kind):\(id)",
              revision.range(of: "^[0-9]{16}-[a-zA-Z0-9-]+$", options: .regularExpression) != nil,
              let time = Int64(revision.prefix(16)), time <= 9_007_199_254_740_991 else {
            throw WorkoutCloudError(code: "schema")
        }
        if !deleted {
            guard let data = value?.data(using: .utf8),
                  let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["id"] as? String == id else { throw WorkoutCloudError(code: "schema") }
        }
    }

    // Lexicographic UTF-16 order also matches JavaScript's string comparison.
    func isNewer(than other: WorkoutEnvelope?) -> Bool {
        guard let other else { return true }
        if revision != other.revision { return other.revision.utf16.lexicographicallyPrecedes(revision.utf16) }
        if deleted != other.deleted { return deleted }
        return (other.value ?? "").utf16.lexicographicallyPrecedes((value ?? "").utf16)
    }

    func tombstone(after otherRevision: String? = nil) -> WorkoutEnvelope {
        let time = max(Int64(Date().timeIntervalSince1970 * 1000), Int64(revision.prefix(16)) ?? 0, Int64((otherRevision ?? "").prefix(16)) ?? 0) + 1
        return WorkoutEnvelope(version: 1, key: key, kind: kind, id: id,
                               revision: String(format: "%016lld", time) + "-" + UUID().uuidString,
                               deleted: true, value: nil)
    }
}
