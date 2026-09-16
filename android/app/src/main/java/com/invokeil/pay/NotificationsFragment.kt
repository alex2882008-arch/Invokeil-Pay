package com.invokeil.pay

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.invokeil.pay.databinding.FragmentNotificationsBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Notifications tab — merged recent activity from the panel:
 * payments, sent emails and sent SMS (last 30, newest first).
 */
class NotificationsFragment : Fragment() {

    private var _b: FragmentNotificationsBinding? = null
    private val b get() = _b!!
    private lateinit var adapter: NotificationAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _b = FragmentNotificationsBinding.inflate(inflater, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        adapter = NotificationAdapter()
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
            val res = ApiClient.getNotifications(ctx)
            val items = (res as? ApiResult.SuccessData<List<DeviceNotification>>)?.value
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
