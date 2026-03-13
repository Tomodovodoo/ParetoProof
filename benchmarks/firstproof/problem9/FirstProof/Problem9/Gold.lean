import FirstProof.Problem9.Statement

namespace FirstProof.Problem9

theorem problem9_gold (n : Nat) :
    triangular (Nat.succ n) = triangular n + Nat.succ n := by
  simpa using problem9 n

end FirstProof.Problem9
