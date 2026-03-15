import FirstProof.Problem9.Support

namespace FirstProof.Problem9

theorem problem9_gold (n : Nat) :
    2 * triangular n = n * Nat.succ n := by
  induction n with
  | zero =>
      rfl
  | succ n ih =>
      calc
        2 * triangular (Nat.succ n)
            = 2 * (triangular n + Nat.succ n) := by
                exact congrArg (fun value => 2 * value) (triangular_succ n)
        _ = 2 * triangular n + 2 * Nat.succ n := by
              exact Nat.left_distrib 2 (triangular n) (Nat.succ n)
        _ = n * Nat.succ n + 2 * Nat.succ n := by
              exact congrArg (fun value => value + 2 * Nat.succ n) ih
        _ = n * Nat.succ n + (Nat.succ n + Nat.succ n) := by
              exact congrArg (fun value => n * Nat.succ n + value) (two_mul_nat (Nat.succ n))
        _ = Nat.succ n * n + (Nat.succ n + Nat.succ n) := by
              exact congrArg
                (fun value => value + (Nat.succ n + Nat.succ n))
                (Nat.mul_comm n (Nat.succ n))
        _ = (Nat.succ n * n + Nat.succ n) + Nat.succ n := by
              exact (Nat.add_assoc (Nat.succ n * n) (Nat.succ n) (Nat.succ n)).symm
        _ = Nat.succ n * Nat.succ n + Nat.succ n := by
              exact congrArg
                (fun value => value + Nat.succ n)
                (Nat.mul_succ (Nat.succ n) n).symm
        _ = Nat.succ n * Nat.succ (Nat.succ n) := by
              exact (Nat.mul_succ (Nat.succ n) (Nat.succ n)).symm

end FirstProof.Problem9
