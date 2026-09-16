package com.invokeil.pay

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.invokeil.pay.databinding.FragmentOutgoingBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Outgoing payments tab — payout commands dispatched to this device.
 * Confirm / Failed buttons POST the execution result back to the panel.
 * The feature is beta: the empty state explains how it works.
 */
class OutgoingFragment : Fragment() {

    private var _b: FragmentOutgoingBinding? = null
    private val b get() = _b!!
    private lateinit var adapter: OutgoingAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _b = FragmentOutgoingBinding.inflate(inflater, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        adapter = OutgoingAdapter(
            onConfirm = { c -> reportResult(c, "CONFIRMED") },
            onFailed = { c -> reportResult(c, "FAILED") },
        )
        b.recycler.layoutManager = LinearLayoutManager(requireContext())
        b.recycler.adapter = adapter
        b.btnRefresh.setOnClickListener { reload() }
        reload()
    }

    override fun onResume() {
        super.onResume()
        reload()
    }

    private fun reload() {
        val ctx = requireContext()
        if (!Prefs.isConfigured(ctx)) {
            showEmpty()
            return
        }
        b.progress.visibility = View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch(Dispatchers.IO) {
            val res = ApiClient.getCommands(ctx)
            val items = (res as? ApiResult.SuccessData<List<OutgoingCommand>>)?.value
            withContext(Dispatchers.Main) {
                b.progress.visibility = View.GONE
                if (items == null) {
                    showEmpty()
                } else {
                    adapter.submitList(items)
                    b.emptyState.visibility =
                        if (items.isEmpty()) View.VISIBLE else View.GONE
                    b.recycler.visibility =
                        if (items.isEmpty()) View.GONE else View.VISIBLE
                }
            }
        }
    }

    private fun reportResult(command: OutgoingCommand, result: String) {
        val ctx = requireContext()
        viewLifecycleOwner.lifecycleScope.launch(Dispatchers.IO) {
            val res = ApiClient.postCommandResult(ctx, command.id, result)
            withContext(Dispatchers.Main) {
                Toast.makeText(
                    ctx,
                    if (res is ApiResult.Success || res is ApiResult.SuccessData<*>) R.string.outgoing_result_ok
                    else R.string.outgoing_result_fail,
                    Toast.LENGTH_LONG
                ).show()
                reload()
            }
        }
    }

    private fun showEmpty() {
        adapter.submitList(emptyList())
        b.emptyState.visibility = View.VISIBLE
        b.recycler.visibility = View.GONE
        b.progress.visibility = View.GONE
    }

    override fun onDestroyView() {
        _b = null
        super.onDestroyView()
    }
}
