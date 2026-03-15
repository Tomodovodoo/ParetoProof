namespace FirstProof.Problem9

def triangular : Nat -> Nat
  | 0 => 0
  | Nat.succ n => triangular n + Nat.succ n

@[simp] theorem triangular_succ (n : Nat) :
    triangular (Nat.succ n) = triangular n + Nat.succ n := rfl

@[simp] theorem two_mul_nat (n : Nat) :
    2 * n = n + n := by
  rw [show 2 = Nat.succ 1 by rfl, Nat.succ_mul, Nat.one_mul]

end FirstProof.Problem9
