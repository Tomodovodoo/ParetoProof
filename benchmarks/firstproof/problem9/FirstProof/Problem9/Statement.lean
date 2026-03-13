import FirstProof.Problem9.Support

namespace FirstProof.Problem9

theorem problem9 (n : Nat) :
    triangular (Nat.succ n) = triangular n + Nat.succ n := by
  rfl

end FirstProof.Problem9
