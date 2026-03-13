namespace FirstProof.Problem9

def double : Nat -> Nat
  | 0 => 0
  | n + 1 => Nat.succ (Nat.succ (double n))

end FirstProof.Problem9
