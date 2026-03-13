import FirstProof.Problem9.Statement

namespace FirstProof.Problem9

theorem problem9 (n : Nat) : problem9Target n := by
  induction n with
  | zero =>
      simp [problem9Target, double]
  | succ n ih =>
      simp [problem9Target, double, ih, Nat.add_assoc, Nat.add_left_comm, Nat.add_comm]

end FirstProof.Problem9
